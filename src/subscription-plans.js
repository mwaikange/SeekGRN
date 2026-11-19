export const PLANS = Object.freeze({
 monthly:Object.freeze({id:'monthly',name:'Monthly',monthly:50,months:1,total:50,quota:20}),
 biannual:Object.freeze({id:'biannual',name:'Biannually',monthly:40,months:6,total:240,quota:30}),
 annual:Object.freeze({id:'annual',name:'Annually',monthly:30,months:12,total:360,quota:null})
});
export const planList=Object.values(PLANS);
export const monthlyYearCost=PLANS.monthly.total*12;
export function annualSavings(plan){
 const amount=monthlyYearCost-plan.total*12/plan.months;
 return {amount,percent:Math.round(amount/monthlyYearCost*100)};
}
export function regularSubscriber(user,isAdmin){return Boolean(user&&!isAdmin);}
export function preparationAvailable(status){return Boolean(status&&(status.unlimited||status.remaining>0||status.free_remaining>0));}
