import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { generateDealId } from '../utils/utils.js';
import logger from '../utils/logger.js';

puppeteer.use(StealthPlugin());

function cleanText(text) {
  const trimmed = text?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function getUTCTimestamp() {
  return new Date().toISOString();
}

async function asyncPool(tasks, limit) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

export default async function scrapeDesiDime(browser, page = 1) {
  let tab;
  try {
    tab = await browser.newPage();
    await tab.setRequestInterception(true);

    tab.on('request', req => {
      const blocked = ['image', 'stylesheet', 'font'];
      if (blocked.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await tab.goto(`https://www.desidime.com/new?page=${page}&deals_view=deal_grid_view`, {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    const html = await tab.content();
    const $ = cheerio.load(html);
    const dealElements = $('div#deals-grid ul.cf > li.tablet-grid-25.padfix.grid-20').toArray().reverse();

    const tasks = dealElements.map((li) => async () => {
      try {
        const el = $(li);

        const title = (cleanText(el.find('div.deal-dsp a').text()) || '').trim();
        const price = (cleanText(el.find('div.deal-price').text()) || '')
          .replace('₹', '')
          .trim();

        let discount = null;
        const percentSpan = (cleanText(el.find('div.deal-percent span.percentoff').text()) || '').trim();
        const offSpan = (cleanText(el.find('div.deal-percent span.dealoff').text()) || '').trim();
        if (percentSpan && offSpan) {
          discount = `${percentSpan} ${offSpan}`;
        } else {
          discount = (cleanText(el.find('div.deal-discount').text()) || '').trim() || null;
        }

        const store = (cleanText(el.find('div.deal-store.ftl').text()) || '').trim();

        const imgSrc = el.find('div.deal-box-image img').attr('data-src') || '';
        const image = imgSrc ? `${imgSrc}` : null;
        const redirectHref = el.find('div.getdeal a').attr('data-href') || '';
        const redirectUrl = (cleanText(redirectHref) || '').trim();

        const posted = getUTCTimestamp();

        if (!title || !store || !redirectUrl) {
          logger.warn('Skipping incomplete DesiDime deal', { title, store, redirectUrl });
          return null;
        }

        const deal_id = generateDealId(title,store);
        if (!deal_id) return null;

        return {
          deal_id,
          title,
          price: price || null,
          originalPrice: null,
          discount,
          store,
          image,
          redirectUrl,
          posted_on: posted,
          url: null,
        };
      } catch (innerErr) {
        logger.error('Error processing individual DesiDime deal', { error: innerErr.stack });
        return null;
      }
    });

    const deals = await asyncPool(tasks, 1);
    return deals.filter(Boolean);
  } catch (err) {
    logger.error('Error parsing DesiDime deals', { error: err.stack });
    return null;
  } finally {
    if (tab) {
      await tab.close();
    }
  }
}
