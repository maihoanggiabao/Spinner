const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxies = fs.readFileSync('proxy.txt', 'utf8').split('\n').filter(Boolean);
let queries = [];
try {
  const data = fs.readFileSync('query.txt', 'utf8');
  queries = data.split('\n').map(line => line.trim()).filter(line => line !== '');
} catch (err) {
  console.error('Không thể đọc file query.txt:', err);
  process.exit(1);
}

let currentQueryIndex = 0;
let currentProxyIndex = 0;

function getCurrentQueryId() {
  return queries[currentQueryIndex];
}

function getNextProxy() {
  const proxy = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  return proxy;
}

async function changeProxy() {
  const proxy = getNextProxy();
  const proxyAgent = new HttpsProxyAgent(proxy);
  await checkProxyIP(proxyAgent);
  return proxyAgent;
}

function nextQueryId() {
  currentQueryIndex += 1;
  if (currentQueryIndex >= queries.length) {
    currentQueryIndex = 0;
    console.log('Đã spin hết tất cả tài khoản. Chờ 5 giờ trước khi khởi động lại...');
    return false;
  } else {
    const initData = getCurrentQueryId();
    const decoded = decodeURIComponent(initData);
    const userPattern = /user=([^&]+)/;
    const userMatch = decoded.match(userPattern);
    if (userMatch && userMatch[1]) {
      const userInfoStr = userMatch[1];
      try {
        const userInfo = JSON.parse(userInfoStr);
        console.log(`Chuyển sang tài khoản ${userInfo.first_name} ${userInfo.last_name}`);
      } catch (error) {
        console.error('Lỗi phân tích thông tin người dùng:', error);
      }
    } else {
      console.log('Không thể tìm thông tin người dùng trong initData');
    }
  }
  return true;
}

function getClick() {
  return Math.floor(Math.random() * 11) + 20;
}

let payloadspin = {
  "initData": getCurrentQueryId(),
  "data": { "clicks": getClick(), "isClose": null }
};

async function callSpinAPI(proxyAgent) {
  payloadspin.initData = getCurrentQueryId();
  try {
    await axios.post('https://back.timboo.pro/api/upd-data', payloadspin, {
      headers: {
        'Content-Type': 'application/json'
      },
      httpsAgent: proxyAgent
    });
  } catch (error) {
    handleAPIError(error, 'first API');
    if (error.response && error.response.data.message === 'Data acquisition error1') {
      console.log('Lỗi thu thập dữ liệu, chuyển tài khoản tiếp theo...');
    }
  }
}

async function callRepairAPI(proxyAgent) {
  const payloadRepairAPI = {
    "initData": getCurrentQueryId()
  };

  try {
    await axios.post('https://back.timboo.pro/api/repair-spinner', payloadRepairAPI, {
      headers: {
        'Content-Type': 'application/json'
      },
      httpsAgent: proxyAgent
    });

    console.log('Sửa spin thành công.');
  } catch (error) {
    handleAPIError(error, 'repair API');
  }
}

async function spinAllSpinners(proxyAgent) {
  const payloadlayData = {
    "initData": getCurrentQueryId()
  };

  try {
    let response = await axios.post('https://back.timboo.pro/api/init-data', payloadlayData, {
      headers: {
        'Content-Type': 'application/json'
      },
      httpsAgent: proxyAgent
    });

    let responseData = response.data;
    let spinners = responseData.initData.spinners;

    while (spinners.some(spinner => !spinner.isBroken && spinner.hp > 0)) {
      const spinPromises = spinners.filter(spinner => !spinner.isBroken && spinner.hp > 0).map(spinner => callSpinAPI(proxyAgent));
      await Promise.all(spinPromises);

      response = await axios.post('https://back.timboo.pro/api/init-data', payloadlayData, {
        headers: {
          'Content-Type': 'application/json'
        },
        httpsAgent: proxyAgent
      });

      responseData = response.data;
      spinners = responseData.initData.spinners;

      const { balance, league } = responseData.initData.user;
      const spinnerHPs = spinners.map(s => s.hp);
      console.log(`Spin thành công: Balance: ${balance}, League: ${league.name}, Spinner HP: ${spinnerHPs.join(', ')}`);
    }

    const brokenSpinners = spinners.filter(spinner => spinner.isBroken && spinner.endRepairTime === null);
    if (brokenSpinners.length > 0) {
      await callRepairAPI(proxyAgent);
    }
  } catch (error) {
    handleAPIError(error, 'spinAllSpinners function');
  }
}

async function layData(proxyAgent) {
  await checkAndOpenBox(proxyAgent);
  await spinAllSpinners(proxyAgent);
  const hasNextQuery = nextQueryId();
  if (!hasNextQuery) {
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 60 * 1000));
    return;
  }
  proxyAgent = await changeProxy(); 
}

async function checkAndOpenBox(proxyAgent) {
  const payload = {
    "initData": getCurrentQueryId()
  };

  try {
    const response = await axios.post('https://api.timboo.pro/get_data', payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      httpsAgent: proxyAgent
    });

    if (response.status === 200 && response.data && response.data.boxes) {
      const boxes = response.data.boxes;
      const boxToOpen = boxes.find(box => box.open_time === null);

      if (boxToOpen) {
        console.log(`Mở hộp ${boxToOpen.name}...`);
        const openBoxPayload = {
          "initData": getCurrentQueryId(),
          "boxId": boxToOpen.id
        };

        await axios.post('https://api.timboo.pro/open_box', openBoxPayload, {
          headers: {
            'Content-Type': 'application/json'
          },
          httpsAgent: proxyAgent
        });
        console.log(`Đã mở hộp ${boxToOpen.name}.`);
      }
    }
  } catch (error) {
    handleAPIError(error, 'checkAndOpenBox API');
  }
}

async function checkProxyIP(proxyAgent) {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: proxyAgent
    });
    if (response.status === 200) {
      console.log('Địa chỉ IP của proxy là:', response.data.ip);
    } else {
      console.error('Không thể kiểm tra IP của proxy. Status code:', response.status);
    }
  } catch (error) {
    console.error('Error khi kiểm tra IP của proxy:', error);
  }
}

function handleAPIError(error, apiName) {
  if (error.response) {
    console.error(`Lỗi ${apiName}:`, error.response.data);
    console.error('Trạng thái:', error.response.status);
  } else if (error.request) {
    console.error(`Không nhận được phản hồi từ ${apiName}:`, error.request);
  } else {
    console.error(`Lỗi rồi ${apiName}:`, error.message);
  }
}

async function startLoop() {
  let proxyAgent = await changeProxy();

  while (true) {
    await layData(proxyAgent);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

startLoop();
