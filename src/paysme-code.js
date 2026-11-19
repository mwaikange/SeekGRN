export function paySMECode(value){
 if(typeof value!=='string')return null;
 const code=value.trim();
 return /^\d{4}-?\d{4}-?\d{4}$/.test(code)?code.replace(/-/g,'').match(/\d{4}/g).join('-'):null;
}
