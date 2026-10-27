export type Leg={flight:string;airline:string;from:string;to:string;departure:string;arrival:string;direct:boolean;cabin:string;bag:string};
export type Fare={id:string;source:string;price:number;basis:string;taxVerified:boolean;ticketType:string;legs:Leg[];url:string;checkedAt?:string};
export type Snapshot={date:string;source:string;checkedAt:string;status:string;note:string;items:Fare[]};
export const dates=[{id:'20261231',out:'2026-12-31',back:'2027-01-04',title:'跨年出发',label:'12月31日 → 1月4日'},{id:'20270101',out:'2027-01-01',back:'2027-01-05',title:'元旦出发',label:'1月1日 → 1月5日'}];
export const sources=[{id:'fliggy',name:'飞猪',url:'https://flyai.open.fliggy.com/console',status:'实时已接入'},{id:'tuniu',name:'途牛',url:'https://open.tuniu.com/mcp/docs/',status:'实时已接入'},{id:'skyscanner',name:'Skyscanner',url:'https://skyscanner.net/g/referrals/v1/flights/home?mediaPartnerId=2850210&utm_term=skyscanner_chatgpt_app_data',status:'对话查询记录 · 网页未自动刷新'},{id:'ctrip',name:'携程',url:'https://flights.ctrip.com/',status:'官方查价 · 手动查询'},{id:'ly',name:'同程',url:'https://m-v6.ly.com/',status:'官方查价 · 手动查询'}];
export const browserSources=[{id:'google',name:'Google Flights'}];
export const consumerSources=[
 {name:'携程',url:'https://flights.ctrip.com/',note:'网站适配待实测；点击助手按钮可回传搜索控件诊断。'},
 {name:'同程',url:'https://m.ly.com/flight/',note:'官方移动网页；动态城市和日历控件待适配。'},
 {name:'Google Flights',url:'https://www.google.com/travel/flights/?hl=zh-CN&curr=CNY',note:'已按诊断新增 Google 城市候选与日历操作，仍待官网实测。'}
];
export function fits(f:Fare,daytime:boolean,direct:boolean,economy:boolean){return f.legs.length===2&&f.legs.every(l=>(!daytime||(l.departure.slice(11,16)>='10:00'&&l.departure.slice(11,16)<='17:00'))&&(!direct||l.direct)&&(!economy||l.cabin.split('/').every(c=>c==='经济舱')));}
