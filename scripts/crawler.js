const puppeteer = require("puppeteer");
const fetch = require("node-fetch").default;
const fs = require("fs").promises;
const BN = require("bn.js");
const { twitterIdMap } = require("./data");

const baseUrl = "https://juicebox.money/#/p/";
const headers = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en",
  "content-type": "application/json",
  "sec-ch-ua":
    '" Not A;Brand";v="99", "Chromium";v="96", "Google Chrome";v="96"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  Referer: "https://juicebox.money/",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function parseEther(eth) {
  const value = eth.replace(/,/g, "");
  const bn = new BN(value, 10);
  const result = bn.mul(new BN(10, 10).pow(new BN(18))).toString(10);
  // console.log(eth, "=>", result);
  return result;
}

function parsePercent(percent) {
  return parseInt(percent, 10) / 100;
}

async function fetchProjects() {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers,
      body: '{"query":"{ projects(orderBy: totalPaid, orderDirection: desc) { id handle creator createdAt uri currentBalance totalPaid totalRedeemed } }"}',
      method: "POST",
    }
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

async function crawl(juiceId) {
  const url = baseUrl + juiceId;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle2",
  });
  await page.waitForTimeout(1000);
  await page.waitForSelector(".ant-layout-content");
  const contentEl = await page.$(".ant-layout-content");
  const content = await contentEl.evaluate((el) => el.textContent);
  if (content.toLowerCase().trim().endsWith("not found")) {
    console.log(`Project ${juiceId} not found`);
    return null;
  }
  await page.waitForSelector('[aria-label="info-circle"]', {
    timeout: 8000,
  });

  const title = await page.$("h1");
  const data = await title.evaluate((el) => {
    const name = el.textContent;
    const logo =
      el.parentElement.previousElementSibling?.querySelector("img")?.src ?? "";
    const nextRow = el.nextElementSibling;
    const id = nextRow.firstElementChild.textContent.slice(1);
    const website = nextRow.firstElementChild.nextElementSibling?.href;
    const twitter = nextRow.querySelector('a[href*="twitter.com"]')?.href;
    const discord =
      nextRow.querySelector('a[href*="discord.gg"]')?.href ?? null;

    return { name, logo, id, website, twitter, discord };
  });

  const summaryEl = await page.$(".ant-row-bottom");
  const summaryText = await summaryEl.evaluate((el) =>
    el.textContent.toLowerCase()
  );

  console.assert(
    summaryText.includes("overflow"),
    `Can not found "overflow" in ${juiceId}`
  );

  const volumeEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[1]/span[2]/span[2]'
  );
  const volume = volumeEl[0]
    ? await volumeEl[0].evaluate((el) => el.textContent.slice(1))
    : null;

  const inJuiceboxEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[2]/div[2]/span'
  );
  const inJuicebox = await inJuiceboxEl[0].evaluate((el) =>
    el.textContent.slice(1)
  );

  const overflowEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[3]/span/span[1]'
  );
  const overflow = overflowEl[0]
    ? parsePercent(await overflowEl[0].evaluate((el) => el.textContent))
    : null;

  const inWalletEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[4]/span[2]/span[2]'
  );
  const inWallet = inWalletEl[0]
    ? await inWalletEl[0].evaluate((el) => el.textContent.slice(1))
    : null;

  await page.waitForTimeout(5000);
  const jbxEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[4]/span[2]/span[1]/div/span'
  );
  const jbx = jbxEl[0]
    ? await jbxEl[0].evaluate((el) => el.textContent.split(" ")[0])
    : null;

  await page.click(".ant-collapse-header");
  await page.waitForTimeout(100);

  const cells = await page.$$(
    ".ant-collapse-content .ant-descriptions-row .ant-descriptions-item"
  );

  const labelSelector =
    ".ant-descriptions-item-container .ant-descriptions-item-label";
  const valueSelector =
    ".ant-descriptions-item-container .ant-descriptions-item-content";
  await page.addScriptTag({
    content: `
    window.labelSelector = ${JSON.stringify(labelSelector)}
    window.valueSelector = ${JSON.stringify(valueSelector)}
    `,
  });

  const fundingCycle = await [...cells].reduce(
    async (pending, cell) => {
      let label = await cell.evaluate(
        (el) => el.querySelector(labelSelector).textContent
      );
      label = label.toLowerCase().trim();
      const result = await pending;
      switch (label) {
        case "target":
          return {
            ...result,
            target: parseEther(
              await cell.evaluate((el) =>
                el.querySelector(valueSelector).textContent.slice(1)
              )
            ),
          };
        case "duration":
          return {
            ...result,
            duration: await cell.evaluate(
              (el) => el.querySelector(valueSelector).textContent
            ),
          };
        case "start":
          return {
            ...result,
            start: await cell.evaluate(
              (el) => el.querySelector(valueSelector).textContent
            ),
          };
        case "end":
          return {
            ...result,
            end: await cell.evaluate(
              (el) => el.querySelector(valueSelector).textContent
            ),
          };
        case "discount rate":
          return {
            ...result,
            discount: parsePercent(
              await cell.evaluate(
                (el) => el.querySelector(valueSelector).textContent
              )
            ),
          };
        case "reserved":
          return {
            ...result,
            reserved: parsePercent(
              await cell.evaluate(
                (el) => el.querySelector(valueSelector).textContent
              )
            ),
          };
        case "bonding curve":
          return {
            ...result,
            bondingCurve: parsePercent(
              await cell.evaluate(
                (el) => el.querySelector(valueSelector).textContent
              )
            ),
          };
        default:
          if (label.endsWith("/eth")) {
            return {
              ...result,
              toETH: await cell.evaluate((el) =>
                parseInt(el.querySelector(valueSelector).textContent, 10)
              ),
            };
          }
      }
      return result;
    },
    { toETHSymbol: "PEOPLE" }
  );

  const { address: tokenAddress, totalSupply } =
    (await crawlPeopleTokens(page)) ?? {};

  console.log({ tokenAddress, totalSupply });

  await page.close();
  return {
    ...data,
    volume,
    inJuicebox,
    overflow,
    inWallet: inWallet ?? "0",
    jbx: jbx ?? "0",
    fundingCycles: [fundingCycle],
    tokenAddress,
    totalSupply,
    // strategy,
    // strategyDescription,
  };
}

async function crawlPayEvents(projectId) {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers,
      body: `{"query":"{ payEvents(first: 50, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id amount beneficiary note timestamp txHash } }"}`,
      method: "POST",
    }
  );
  const josn = await rsp.json();
  const events = josn.data.payEvents;
  return events;
}

async function crawlRedeemEvents(projectId) {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers,
      body: `{"query":"{ redeemEvents(first: 50, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id amount beneficiary id returnAmount timestamp txHash } }"}`,
      method: "POST",
    }
  );
  const josn = await rsp.json();
  const events = josn.data.redeemEvents;
  return events;
}

async function crawlWithdrawEvents(projectId) {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers,
      body: `{"query":"{ tapEvents(first: 50, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id netTransferAmount fundingCycleId timestamp txHash beneficiary caller beneficiaryTransferAmount } }"}`,
      method: "POST",
    }
  );
  const json = await rsp.json();
  const events = json.data.tapEvents;
  return events;
}

async function crawlReservesEvents(projectId) {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers,
      body: `{"query":"{ printReservesEvents(first: 50, skip: 0, orderBy: timestamp, orderDirection: desc, where: { project: \\"${projectId}\\" }) { id id count beneficiary beneficiaryTicketAmount timestamp txHash caller } }"}`,
      method: "POST",
    }
  );
  const josn = await rsp.json();
  const events = josn.data.printReservesEvents;
  return events;
}

async function crawlPeopleTokens(page) {
  const sectionEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[3]/div[1]/div[2]/div/div'
  );

  if (!sectionEl[0]) return null;
  const addressEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[3]/div[1]/div[2]/div/div/div/div/div[2]/div/div/table/tbody/tr[1]/td/div/span[2]/div/span'
  );
  let address = null;
  if (addressEl[0]) {
    await addressEl[0].hover();
    await page.waitForSelector(".ant-tooltip");
    await page.waitForTimeout(300);
    const tooltipEl = await page.$(".ant-tooltip");
    address = await tooltipEl.evaluate((el) => el.textContent.trim());
  } else {
    console.log("No address element");
  }
  const result = await sectionEl[0].evaluate((secEl) => {
    const cells = [...secEl.querySelectorAll(".ant-descriptions-item")];
    return (
      cells.reduce((map, cell) => {
        let label = cell.querySelector(window.labelSelector).textContent;
        let valueEl = cell.querySelector(window.valueSelector);
        label = label.toLowerCase();
        switch (label) {
          case "total supply":
            return {
              ...map,
              totalSupply:
                valueEl.firstElementChild.firstChild.textContent.replace(
                  /,/g,
                  ""
                ),
            };
        }
        return map;
      }, {}) ?? {}
    );
  });
  const finalResult = {
    address,
    ...result,
  };
  console.log({ finalResult });

  return finalResult;
}

async function fetchInfo(url) {
  const rsp = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "sec-ch-ua":
        '" Not A;Brand";v="99", "Chromium";v="96", "Google Chrome";v="96"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      Referer: "https://juicebox.money/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: null,
    method: "GET",
  });
  const info = await rsp.json();
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
      await wait(1000);
      let info = await fetchInfo(
        `https://jbx.mypinata.cloud/ipfs/${projects[i].uri}`
      );
      const combined = {
        ...projects[i],
        ...info,
      };
      if (combined.twitter) {
        let twitter_handler = combined.twitter.startsWith("https")
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
              jbx: dataInPage.jbx,
              tokenAddress: dataInPage.tokenAddress,
              totalSupply: dataInPage.totalSupply,
            });
          }
        } catch (err) {
          console.log(`Failed to crawl ${juiceboxId}`, err);
        }
        Object.assign(combined, {
          payEvents: await crawlPayEvents(combined.id),
          redeemEvents: await crawlRedeemEvents(combined.id),
          withdrawEvents: await crawlWithdrawEvents(combined.id),
          reservesEvents: await crawlReservesEvents(combined.id),
        });
        fs.writeFile(
          `./development/com.maskbook.dao-${twitter_handler}.json`,
          JSON.stringify(combined, null, 2)
        );
        data.push(combined);
      }
    } catch (err) {
      console.log(err);
    }
  }
  await closeBrowesr();

  fs.writeFile(
    "./development/com.maskbook.dao.json",
    JSON.stringify(data, null, 2)
  );
}

crawlProjects();
