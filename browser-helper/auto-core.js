(() => {
  // Bounded readiness checks; no search submission or challenge interaction.
  async function run({probe,capture,report,cancelled,wait,maxChecks=40}) {
    let previous='',stable=0,last='等待官网结果加载';
    for(let i=0;i<maxChecks;i++) {
      await wait(3000);
      if(cancelled()) return;
      try {
        const fingerprint=await probe();
        last=fingerprint?'官网列表仍在变化，尚未完成读取':'等待官网结果加载';
        stable=fingerprint&&fingerprint===previous?stable+1:1;
        previous=fingerprint||'';
        if(previous&&stable>=3) {
          if(cancelled())return;
          await report('running','正在读取并回传');
          let result;try{result=await capture();}catch(e){if(!cancelled())await report('waiting',e.message||'读取失败，请手动重试');return;}
          if(cancelled())return;
          await report(result?.read&&!result.pending?'done':'waiting',result?.message||result?.error||'暂无可读取报价，请检查官网');
          return;
        }
      } catch(e) {
        last=e.message||'官网结果尚未就绪';previous='';stable=0;
        if(/登录|验证|captcha|sign.?in|log.?in/i.test(last)) {await report('waiting',last);return;}
      }
    }
    if(!cancelled())await report('waiting',last+'；请打开官网处理后继续');
  }
  globalThis.flightAutoCore={run};
})();
