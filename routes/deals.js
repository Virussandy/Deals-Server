import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import desidime from '../scrapers/desidime.js';
import dealsmagnet from '../scrapers/dealsmagnet.js';
import { db, rtdb } from '../firebase.js';
import { notifyChannels } from '../utils/notifier.js';
import { insertOrReplaceMeeshoInvite, resolveOriginalUrl, sanitizeUrl, convertAffiliateLink } from '../utils/utils.js';
import { uploadImageFromUrl } from '../utils/uploadImage.js';
import logger from '../utils/logger.js';

puppeteer.use(StealthPlugin());
const router = express.Router();
const CACHE_PATH = 'deals_cache';

export async function processDeals(page = 1) {
    let browser;
    try {
        logger.info('Launching new browser instance for this run...');
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        const [desidimeDeals, dealsmagnetDeals] = await Promise.all([
            desidime(browser, page),
            dealsmagnet(browser, page),
        ]);

        const allDeals = [...(desidimeDeals || []), ...(dealsmagnetDeals || [])];
        if (allDeals.length === 0) {
            logger.info('No deals scraped from any source.');
            return { message: 'No deals found', scraped: 0, stored: 0 };
        }
        
        const dealMap = new Map();
        const dealIds = [];

        for (const deal of allDeals.reverse()) {
            if (deal?.deal_id) {
                dealMap.set(deal.deal_id, deal);
                dealIds.push(deal.deal_id);
            }
        }

        const cacheRef = rtdb.ref(CACHE_PATH);
        const cacheSnapshot = await cacheRef.once('value');
        const cache = cacheSnapshot.val() || {};
        
        const newDeals = [];
        for (const id of dealIds) {
            if (!cache[id]) {
                newDeals.push(dealMap.get(id));
            }
        }

        logger.info(`${newDeals.length} new deals to resolve and store`);

        if (newDeals.length === 0) {
            return { message: 'No new deals to process', scraped: allDeals.length, stored: 0 };
        }

        const validDealsToNotify = [];

        for (const deal of newDeals) {
            try {
                logger.info('Processing deal', { redirectUrl: deal.redirectUrl });
                const store = deal.store;
                const resolvedUrl = await resolveOriginalUrl(browser, deal.redirectUrl, 1);
                logger.info('Resolved URL', { resolvedUrl });

                if (!resolvedUrl) {
                    logger.warn('Skipping deal due to failed navigation', { dealId: deal.deal_id });
                    continue;
                }

                if (store === 'DesiDime') {
                    logger.warn('Skipping deal because store is DesiDime', { dealId: deal.deal_id });
                    continue;
                }

                if (deal.title && deal.title.includes("18+")) {
                    logger.info('Skipping 18+ deal', { title: deal.title });
                    continue;
                }
                
                if (store === 'Meesho'){
                    deal.redirectUrl = insertOrReplaceMeeshoInvite(deal.redirectUrl);
                }

                deal.redirectUrl = resolvedUrl;

                try {
                    const affiliateResponse = await convertAffiliateLink(deal.redirectUrl);
                    if (affiliateResponse.success) {
                        deal.redirectUrl = affiliateResponse.newUrl;
                        deal.url = deal.redirectUrl;
                    } else {
                        const redirectedUrl = sanitizeUrl(deal.redirectUrl);
                        deal.redirectUrl = redirectedUrl;
                        deal.url = redirectedUrl;
                    }
                } catch (err) {
                    logger.error('Affiliate conversion error:', { error: err.message });
                    deal.url = sanitizeUrl(deal.redirectUrl);
                }

                const uploadResult = await uploadImageFromUrl(deal.image, deal.deal_id);
                if (uploadResult && uploadResult.downloadUrl) {
                    deal.image = uploadResult.downloadUrl;
                    validDealsToNotify.push({ deal, buffer: uploadResult.buffer });
                } else {
                    continue;
                }

            } catch (err) {
                logger.error('Unexpected deal processing error', { error: err.message });
            }
        }

        if (validDealsToNotify.length > 0) {
            const firestoreBatch = db.batch();
            const cacheUpdates = {};

            for (const { deal } of validDealsToNotify) {
                const dealRef = db.collection('deals').doc(deal.deal_id);
                firestoreBatch.set(dealRef, deal);
                cacheUpdates[deal.deal_id] = true;
            }

            logger.info(`Committing ${validDealsToNotify.length} deals to the database and cache.`);
            await Promise.all([
                firestoreBatch.commit(),
                cacheRef.update(cacheUpdates)
            ]);
            logger.info('Database and cache have been updated.');

            logger.info('Starting to send notifications...');
            for (const { deal, buffer } of validDealsToNotify) {
                await notifyChannels(deal, buffer);
            }
        } else {
            logger.info('No new valid deals to save or notify.');
        }

        return {
            message: 'Deals processed successfully',
            scraped: allDeals.length,
            stored: validDealsToNotify.length,
            skipped: allDeals.length - validDealsToNotify.length,
        };
    } finally {
        if (browser) {
            await browser.close();
            logger.info('Browser instance closed.');
        }
    }
}

router.post('/', async (req, res) => {
    try {
        logger.info('Manual trigger of processDeals received.');
        const result = await processDeals(1);
        res.status(200).json(result);
    } catch (error) {
        logger.error('Error in POST /deals', { error: error.stack });
        res.status(500).json({ error: 'Failed to process deals from manual trigger' });
    }
});

export default router;
