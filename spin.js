const axios = require('axios');
const fs = require('fs');

let layquery = [];
try {
    const data = fs.readFileSync('query.txt', 'utf8');
    layquery = data.split('\n').map(line => line.trim().replace(/\r$/, '')).filter(line => line !== '');
} catch (err) {
    console.error('Không thể đọc file query.txt:', err);
    process.exit(1);
}

let currentQueryIndex = 0;

function getCurrentQueryId() {
    return layquery[currentQueryIndex];
}

function nextQueryId() {
    currentQueryIndex += 1;
    if (currentQueryIndex >= layquery.length) {
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

async function callSpinAPI() {
    payloadspin.initData = getCurrentQueryId();
    try {
        const response = await axios.post('https://back.timboo.pro/api/upd-data', payloadspin, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        handleAPIError(error, 'first API');
        if (error.response && error.response.data.message === 'Data acquisition error1') {
            console.log('Lỗi thu thập dữ liệu, chuyển tài khoản tiếp theo...');
        }
    }
}

async function layData() {
    const payloadlayData = {
        "initData": getCurrentQueryId()
    };

    try {
        const response = await axios.post('https://back.timboo.pro/api/init-data', payloadlayData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const responseData = response.data;

        const { balance, fullhpAmount, name, league } = responseData.initData.user;
        const spinners = responseData.initData.spinners;

        const spinnerHPs = spinners.map(spinner => spinner.hp);

        for (const spinner of spinners) {
            if (!spinner.isBroken && spinner.hp > 0) {
                await callSpinAPI();
                console.log(`Spin thành công: Balance: ${balance}, League: ${league.name}, Spinner HP: ${spinnerHPs.join(', ')}`);
                return;
            } else if (spinner.isBroken && spinner.endRepairTime === null) {
                await callRepairAPI();
                if (!nextQueryId()) {
                    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 60 * 1000));
                }
                return;
            } else if (spinner.isBroken && spinner.endRepairTime !== null) {
                if (!nextQueryId()) {
                    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 60 * 1000));
                }
                return;
            }
        }
    } catch (error) {
        handleAPIError(error, 'second API');
    }
}

async function callRepairAPI() {
    const payloadRepairAPI = {
        "initData": getCurrentQueryId()
    };

    try {
        const response = await axios.post('https://back.timboo.pro/api/repair-spinner', payloadRepairAPI, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Sửa spin thành công.');
    } catch (error) {
        handleAPIError(error, 'repair API');
    }
}

async function checkAndOpenBox() {
    const payload = {
        "initData": getCurrentQueryId()
    };

    try {
        const response = await axios.post('https://api.timboo.pro/get_data', payload, {
            headers: {
                'Content-Type': 'application/json'
            }
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
                    }
                });
                console.log(`Đã mở hộp ${boxToOpen.name}.`);
            }
        }
    } catch (error) {
        handleAPIError(error, 'checkAndOpenBox API');
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
    while (true) {
        await checkAndOpenBox();
        await layData();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

startLoop();
