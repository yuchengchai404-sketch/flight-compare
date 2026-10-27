const status = document.querySelector('#status');
for (const button of document.querySelectorAll('button')) button.onclick = async () => {
  for (const b of document.querySelectorAll('button')) b.disabled = true;
  status.textContent = '正在执行…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw Error('没有可操作的页面');
    const response = await chrome.tabs.sendMessage(tab.id, { type: button.dataset.action });
    if (response?.error) throw Error(response.error);
    status.textContent = response?.message || '请查看官网右下角助手面板';
  } catch (e) {
    status.textContent = '操作未完成：' + e.message + '\n若刚更新扩展，请刷新官网和比价平台';
  } finally { for (const b of document.querySelectorAll('button')) b.disabled = false; }
};
