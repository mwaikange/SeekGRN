export const PLANS = Object.freeze({
 monthly:Object.freeze({id:'monthly',name:'Monthly',monthly:50,months:1,total:50,quota:20,saving:0}),
 biannual:Object.freeze({id:'biannual',name:'Biannually',monthly:40,months:6,total:240,quota:30,saving:60}),
 annual:Object.freeze({id:'annual',name:'Annually',monthly:30,months:12,total:360,quota:null,saving:240})
});
export const planList=Object.values(PLANS);
export function regularSubscriber(user,isAdmin){return Boolean(user&&!isAdmin);}
export function preparationAvailable(status){return Boolean(status&&(status.unlimited||status.remaining>0||status.free_remaining>0));}
