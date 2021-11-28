const puppeteer = require("puppeteer");
const fetch = require("node-fetch").default;
const fs = require("fs").promises;

const baseUrl = "https://juicebox.money/#/p/";

async function fetchProjects() {
  const rsp = await fetch(
    "https://gateway.thegraph.com/api/6a7675cd9c288a7b9571d5c9e78d5aff/deployments/id/Qmcgtsin741cNTtgnkpoDcY92GDK1isRG5F39FNEmEok4n",
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language":
          "en,zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,zh-TW;q=0.6,fr;q=0.5",
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
      },
      body: '{"query":"{ projects(orderBy: totalPaid, orderDirection: desc) { id handle creator createdAt uri currentBalance totalPaid totalRedeemed } }"}',
      method: "POST",
    }
  );
  const json = await rsp.json();
  const projects = json.data.projects;
  console.log({ projects });
  return projects;
}

let browser;
/**
 * returnlaunchBrowser.
 */
async function launchBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch();
  return browser;
}

async function crawl(id) {
  const url = baseUrl + id;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector('[aria-label="info-circle"]');

  const title = await page.$("h1");
  const data = await title.evaluate((el) => {
    const name = el.textContent;
    const logo =
      el.parentElement.previousElementSibling.querySelector("img").src;
    const nextRow = el.nextElementSibling;
    const id = nextRow.firstElementChild.textContent.slice(1);
    const website = nextRow.firstElementChild.nextElementSibling.href;
    const twitter = nextRow.querySelector('a[href*="twitter.com"]').href;
    const discord = nextRow.querySelector('a[href*="discord.gg"]').href;

    return { name, logo, id, website, twitter, discord };
  });

  const volumeEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[1]/span[2]/span[2]'
  );
  const volume = await volumeEl[0].evaluate((el) => el.textContent.slice(1));

  const inJuiceboxEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[2]/div[2]/span'
  );
  const inJuicebox = await inJuiceboxEl[0].evaluate((el) =>
    el.textContent.slice(1)
  );

  const overflowEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[3]/span/span[1]'
  );
  const overflow = await overflowEl[0].evaluate(
    (el) => parseInt(el.textContent, 10) / 100
  );

  const inWalletEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[4]/span[2]/span[2]'
  );
  const inWallet = await inWalletEl[0].evaluate((el) =>
    el.textContent.slice(1)
  );

  await page.waitForTimeout(5000);
  const jbxEl = await page.$x(
    '//*[@id="root"]/section/main/div/div[1]/div[2]/div[1]/div/div[4]/span[2]/span[1]/div/span'
  );
  const jbx = await jbxEl[0].evaluate((el) => el.textContent.split(" ")[0]);

  console.log({ ...data, volume, inJuicebox, overflow, inWallet, jbx });
  await browser.close();
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
        fs.writeFile(
          `./development/com.maskbook.dao-${combined.twitter.toLowerCase()}.json`,
          JSON.stringify(combined, null, 2)
        );
        data.push(combined);
      }
    } catch (err) {
      console.log(err);
    }
  }

  fs.writeFile(
    "./development/com.maskbook.dao.json",
    JSON.stringify(data, null, 2)
  );
}

crawlProjects();
