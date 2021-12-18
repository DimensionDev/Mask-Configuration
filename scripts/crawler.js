const puppeteer = require('puppeteer');
const fetch = require('node-fetch').default;
const fs = require('fs').promises;
const path = require('path');
const { utils } = require('ethers');
const { twitterIdMap } = require('./data');

const baseUrl = 'https://juicebox.money/#/p/';
const headers = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en',
  'content-type': 'application/json',
  'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="96", "Google Chrome";v="96"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  Referer: 'https://juicebox.money/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function parseEther(eth) {
  // console.log('parseEther', eth);
  let value = eth.trim();
  if (value === '0') return '0';
  try {
    value = value.replace(/,/g, '');
    const result = utils.parseEther(value);
    // console.log(eth, '=>', result.toString());
    return result.toString();
  } catch (e) {
    return '0';
  }
}

async function retryFetch(...args) {
  let result;
  let times = 3;
  while (times-- > 0) {
    result = await fetch(...args);
    if (result.ok) {
      break;
    }
    console.log('retry, remain', times, 'times');
  }
  return result;
}

function parsePercent(percent) {
  return parseInt(percent, 10) / 100;
}

async function fetchProjects() {
  const rsp = await fetch(
    'https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n',
    {
      headers,
      body: '{"query":"{ projects(orderBy: totalPaid, orderDirection: desc) { id handle creator createdAt uri currentBalance totalPaid totalRedeemed } }"}',
      method: 'POST',
    },
  );
  const json = await rsp.json();
  const projects = json.data.projects;
  return projects;
}

let browser;
async function launchBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 1800,
      height: 900,
    },
  });
  return browser;
}

async function closeBrowesr() {
  if (browser) await browser.close();
}

const notFoundList = [];
async function crawl(juiceId) {
  const url = baseUrl + juiceId;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: 'networkidle2',
  });
  await page.waitForTimeout(2000);
  await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
  const contentEl = await page.$('.ant-layout-content');
  const content = await contentEl.evaluate((el) => el.textContent);
  if (content.toLowerCase().trim().endsWith('not found')) {
    console.log(`>> Project ${juiceId} not found`);
    notFoundList.push(juiceId);
    return null;
  }
  await page.waitForSelector('[aria-label="info-circle"]', { timeout: 7000 });

  const title = await page.$('h1');
  const data = await title.evaluate((el) => {
    const name = el.textContent;
    const logo = el.parentElement.previousElementSibling?.querySelector('img')?.src ?? '';
    const nextRow = el.nextElementSibling;
    const id = nextRow.firstElementChild.textContent.slice(1);
    const website = nextRow.firstElementChild.nextElementSibling?.href;
    const twitter = nextRow.querySelector('a[href*="twitter.com"]')?.href;
    const discord = nextRow.querySelector('a[href*="discord.gg"]')?.href ?? null;

    return { name, logo, id, website, twitter, discord };
  });

  const summaryEl = await page.$('.ant-row-bottom');

  // wait for jbx in wallet fetched
  await page.waitForTimeout(5000);
  const summary = await summaryEl.evaluate((sumEl) => {
    const list = [...sumEl.firstElementChild.firstElementChild.children];
    const result = {};
    list.forEach((el) => {
      const iconEl = el.querySelector('.anticon-info-circle');
      if (!iconEl) return;
      const label = iconEl.previousElementSibling.textContent.trim().toLowerCase();
      switch (label) {
        case 'volume':
          const ethSpan = [...el.querySelectorAll('span')].filter((e) => e.textContent === 'Ξ');
          result['volume'] = ethSpan.length ? ethSpan[0].nextSibling.textContent : null;
          break;
        case 'in juicebox':
          result['inJuicebox'] = el.lastElementChild.firstElementChild.textContent.slice(1);
          break;
        case 'distributed':
          result['distributed'] = el.lastElementChild.textContent.split('/').map((t) => t.trim());
          break;
        case 'in wallet':
          result['inWallet'] = {
            eth: el.lastElementChild.lastElementChild.textContent.slice(1),
            jbx: el.lastElementChild.firstElementChild.firstElementChild.firstElementChild
              .firstChild.textContent,
          };
          break;
        default:
          const matches = label.match(/(\d+)% overflow/);
          if (matches) {
            result['overflow'] = matches[1] / 100;
          }
      }
    });
    return result;
  });

  summary.volume = summary.volume ? parseEther(summary.volume) : null;
  summary.inJuicebox = summary.volume ? parseEther(summary.inJuicebox) : null;
  if (summary.inWallet) {
    summary.inWallet.eth = summary.inWallet.eth ? parseEther(summary.inWallet.eth) : null;
    summary.inWallet.jbx = summary.inWallet.jbx ? parseEther(summary.inWallet.jbx) : null;
  }

  const { volume, inJuicebox, distributed, overflow, inWallet } = summary;

  await page.click('.ant-collapse-header');
  await page.waitForTimeout(100);

  const cells = await page.$$('.ant-collapse-content .ant-descriptions-row .ant-descriptions-item');

  const labelSelector = '.ant-descriptions-item-container .ant-descriptions-item-label';
  const valueSelector = '.ant-descriptions-item-container .ant-descriptions-item-content';
  await page.addScriptTag({
    content: `
    window.labelSelector = ${JSON.stringify(labelSelector)}
    window.valueSelector = ${JSON.stringify(valueSelector)}
    `,
  });

  await page.waitForSelector('.ant-statistic-title');
  const fundingTokenEl = await page.$('.ant-statistic-title');
  const fundingTokenSymbol = await fundingTokenEl?.evaluate((el) => {
    if (el.textContent === 'Tokens') return 'PEOPLE';
    return el.textContent.split(' ')[0];
  });
  const fundingCycle = await [...cells].reduce(
    async (pending, cell) => {
      let label = await cell.evaluate((el) => el.querySelector(labelSelector).textContent);
      label = label.toLowerCase().trim();
      const result = await pending;
      switch (label) {
        case 'target':
          return {
            ...result,
            target: parseEther(
              await cell.evaluate((el) => el.querySelector(valueSelector).textContent.slice(1)),
            ),
          };
        case 'duration':
          return {
            ...result,
            duration: await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
          };
        case 'start':
          return {
            ...result,
            start: await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
          };
        case 'end':
          return {
            ...result,
            end: await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
          };
        case 'discount rate':
          return {
            ...result,
            discount: parsePercent(
              await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
            ),
          };
        case 'reserved':
          return {
            ...result,
            reserved: parsePercent(
              await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
            ),
          };
        case 'bonding curve':
          return {
            ...result,
            bondingCurve: parsePercent(
              await cell.evaluate((el) => el.querySelector(valueSelector).textContent),
            ),
          };
        default:
          if (label.endsWith('/eth')) {
            return {
              ...result,
              toETH: await cell.evaluate((el) =>
                parseInt(el.querySelector(valueSelector).textContent, 10),
              ),
            };
          }
      }
      return result;
    },
    { toETHSymbol: fundingTokenSymbol ?? 'PEOPLE' },
  );

  const {
    address: tokenAddress,
    holdingSymbol,
    totalSupply,
  } = (await crawlHoldingTokens(page)) ?? {};

  await page.close();
  return {
    ...data,
    volume,
    inJuicebox,
    overflow,
    inWallet: inWallet ?? '0',
    jbx: inWallet.jbx ?? '0',
    distributed,
    fundingCycles: [fundingCycle],
    tokenAddress,
    totalSupply,
    holdingSymbol,
    // strategy,
    // strategyDescription,
  };
}

const checkResponse = (json, field, projectId) => {
  if (!json.data?.[field]) {
    console.log(`No ${field} record for ${projectId}`, JSON.stringify(json, null, 2));
    return false;
  }
  return true;
};

const eventLength = 50;
async function crawlPayEvents(projectId) {
  const rsp = await retryFetch(
    'https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n',
    {
      headers,
      body: `{"query":"{ payEvents(first: ${eventLength}, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id amount beneficiary note timestamp txHash } }"}`,
      method: 'POST',
    },
  );
  const json = await rsp.json();
  checkResponse(json, 'payEvents', projectId);
  const events = json.data?.payEvents ?? [];
  return events;
}

async function crawlRedeemEvents(projectId) {
  const rsp = await retryFetch(
    'https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n',
    {
      headers,
      body: `{"query":"{ redeemEvents(first: ${eventLength}, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id amount beneficiary id returnAmount timestamp txHash } }"}`,
      method: 'POST',
    },
  );
  const json = await rsp.json();
  checkResponse(json, 'redeemEvents', projectId);
  const events = json.data?.redeemEvents ?? [];
  return events;
}

async function crawlWithdrawEvents(projectId) {
  const rsp = await retryFetch(
    'https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n',
    {
      headers,
      body: `{"query":"{ tapEvents(first: ${eventLength}, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id netTransferAmount fundingCycleId timestamp txHash beneficiary caller beneficiaryTransferAmount } }"}`,
      method: 'POST',
    },
  );
  const json = await rsp.json();
  checkResponse(json, 'tapEvents', projectId);
  const events = json.data?.tapEvents ?? [];
  return events;
}

async function crawlReservesEvents(projectId) {
  const rsp = await retryFetch(
    'https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n',
    {
      headers,
      body: `{"query":"{ printReservesEvents(first: ${eventLength}, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id id count beneficiary beneficiaryTicketAmount timestamp txHash caller } }"}`,
      method: 'POST',
    },
  );
  const json = await rsp.json();
  checkResponse(json, 'printReservesEvents', projectId);
  const events = json.data?.printReservesEvents ?? [];
  return events;
}

async function crawlHoldingTokens(page) {
  const sectionEl = await page.$(
    '.ant-layout-content .ant-row:nth-of-type(3) > .ant-col:nth-child(1) > div:nth-child(2)',
  );

  if (!sectionEl) return null;
  const holdingSymbol = await sectionEl.evaluate((el) => {
    return el
      .querySelector('[aria-label=info-circle]')
      ?.previousElementSibling.textContent.split(' ')[0];
  });
  const addressEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[3]/div[1]/div[2]/div/div/div/div/div[2]/div/div/table/tbody/tr[1]/td/div/span[2]/div/span',
  );
  let address = null;
  if (addressEl[0]) {
    await addressEl[0].hover();
    await page.waitForSelector('.ant-tooltip-open');
    await page.waitForTimeout(300);
    const tooltipEl = await page.$('.ant-tooltip');
    address = await tooltipEl.evaluate((el) => el.textContent.trim());
  } else {
    console.log('No address element');
  }
  const result = await sectionEl.evaluate((secEl) => {
    const cells = [...secEl.querySelectorAll('.ant-descriptions-item')];
    return (
      cells.reduce((map, cell) => {
        let label = cell.querySelector(window.labelSelector).textContent;
        let valueEl = cell.querySelector(window.valueSelector);
        label = label.toLowerCase();
        switch (label) {
          case 'total supply':
            return {
              ...map,
              totalSupply: valueEl.firstElementChild.firstChild.textContent.replace(/,/g, ''),
            };
        }
        return map;
      }, {}) ?? {}
    );
  });
  const finalResult = {
    address,
    holdingSymbol,
    ...result,
  };

  return finalResult;
}

async function fetchInfo(url, key) {
  const cacheFile = path.resolve(__dirname, '../.cache/', key);
  try {
    if (await fs.exists(cacheFile)) {
      const cache = await fs.readFile(cacheFile, 'utf8');
      return JSON.parse(cache);
    }
  } catch (err) {}
  const rsp = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="96", "Google Chrome";v="96"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      Referer: 'https://juicebox.money/',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    body: null,
    method: 'GET',
  });
  const info = await rsp.json();
  await fs.writeFile(cacheFile, JSON.stringify(info));
  return info;
}

function wait(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

async function crawlProjects() {
  const projects = await fetchProjects();
  const data = [];
  await launchBrowser();
  for (let i = 0; i < projects.length; ++i) {
    try {
      console.log('Crawling', projects[i].id);
      await wait(10);
      let info = await fetchInfo(
        `https://jbx.mypinata.cloud/ipfs/${projects[i].uri}`,
        projects[i].uri,
      );
      const combined = {
        ...projects[i],
        ...info,
      };
      if (combined.twitter) {
        let twitter_handler = combined.twitter.startsWith('https')
          ? combined.twitter.split(/\//g).pop()
          : combined.twitter;
        twitter_handler = twitter_handler.toLowerCase().trim();
        const juiceboxId = twitterIdMap[twitter_handler] ?? twitter_handler;
        try {
          const dataInPage = await crawl(juiceboxId);
          if (dataInPage) {
            Object.assign(combined, {
              overflow: dataInPage.overflow,
              fundingCycles: dataInPage.fundingCycles,
              // strategy: dataInPage.strategy,
              // strategyDescription: dataInPage.strategyDescription,
              inWallet: dataInPage.inWallet,
              tokenAddress: dataInPage.tokenAddress,
              totalSupply: dataInPage.totalSupply,
              holdingSymbol: dataInPage.holdingSymbol,
            });
          }
        } catch (err) {
          console.log(`Failed to crawl ${juiceboxId}`, err);
        }
        const [payEvents, redeemEvents, withdrawEvents, reservesEvents] = await Promise.all([
          crawlPayEvents(combined.id),
          crawlRedeemEvents(combined.id),
          crawlWithdrawEvents(combined.id),
          crawlReservesEvents(combined.id),
        ]);
        Object.assign(combined, {
          payEvents,
          redeemEvents,
          withdrawEvents,
          reservesEvents,
        });
        data.push(combined);
        fs.writeFile(
          `./development/com.maskbook.dao-${twitter_handler}.json`,
          JSON.stringify(combined, null, 2),
        );
      }
    } catch (err) {
      console.log(`Failed to crawl ${projects[i].id}`, err);
    }
  }
  await closeBrowesr();

  fs.writeFile('./development/com.maskbook.dao.json', JSON.stringify(data, null, 2));
  fs.writeFile('./not-found.json', JSON.stringify(notFoundList, null, 2));
}

crawlProjects();
