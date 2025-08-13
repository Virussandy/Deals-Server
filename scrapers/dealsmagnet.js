import * as cheerio from 'cheerio';
import { generateDealId } from '../utils/utils.js';
import logger from '../utils/logger.js';

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

export default async function scrapeDealsMagnet(browser, page = 1) {
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

    await tab.goto(`https://www.dealsmagnet.com/new?page=${page}`, {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    const html = await tab.content();
    const $ = cheerio.load(html);
    const dealElements = $('div.col-lg-3.col-md-4.col-sm-6.col-6.pl-1.pr-1.pb-2').toArray().reverse();

    const tasks = dealElements.map(el => async () => {
      try {
        const card = $(el);

        const title = (cleanText(card.find('p.card-text a.MainCardAnchore').text()) || '').trim();

        let redirectUrl = null;
        const buyButton = card.find('button.buy-button');
        if (buyButton.length > 0) {
          const dataCode = buyButton.attr('data-code');
          if (dataCode) {
            redirectUrl = `https://www.dealsmagnet.com/buy?${dataCode}`;
          }
        }

        if (!redirectUrl) {
          const dealHref = card.find('p.card-text a.MainCardAnchore').attr('href') || '';
          redirectUrl = dealHref
            ? (dealHref.startsWith('http') ? dealHref : `https://www.dealsmagnet.com${dealHref}`)
            : null;
        }

        const price = (cleanText(card.find('.card-DealPrice').text()) || '')
          .replace(/\s+/g, ' ')
          .replace('₹', '')
          .trim();

        const originalPrice = (cleanText(card.find('.card-OriginalPrice').text()) || '')
          .replace(/\s+/g, ' ')
          .replace('₹', '')
          .trim();

        const discountBig = (cleanText(card.find('.card-DiscountPrice .big').text()) || '').trim();
        const discountSmall = (cleanText(card.find('.card-DiscountPrice .small').text()) || '').trim();
        const discount = [discountBig, discountSmall].filter(Boolean).join(' ') || null;

        const imgSrc = card.find('.card-img img').attr('data-src') || '';
        const image = imgSrc ? `${imgSrc.replace('-s-', '-o-')}` : null;
        const storeAlt = card.find('.card-footer img').attr('alt') || '';
        const storeRaw = (cleanText(storeAlt) || '').trim();
        const store = storeRaw ? storeRaw.charAt(0).toUpperCase() + storeRaw.slice(1) : '';

        const postedAgo = getUTCTimestamp();

        if (!title || !store || !redirectUrl) {
          logger.warn('Skipping incomplete DealsMagnet deal', { title, store, redirectUrl });
          return null;
        }

        const deal_id = generateDealId(title,store);
        if (!deal_id) return null;

        return {
          deal_id,
          title,
          price: price || null,
          originalPrice: originalPrice || null,
          discount,
          store,
          image,
          redirectUrl,
          posted_on: postedAgo,
          url: null,
        };
      } catch (innerErr) {
        logger.error('Error processing individual deal card', { error: innerErr.stack });
        return null;
      }
    });

    const deals = await asyncPool(tasks, 1);
    return deals.filter(Boolean);
  } catch (err) {
    logger.error('Error parsing DealsMagnet deals', { error: err.stack });
    return null;
  } finally {
    if (tab) {
      await tab.close();
    }
  }
}
