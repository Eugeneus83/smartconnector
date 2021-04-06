var c=function(){
  var e=crypto||msCrypto;
  var t=new Uint8Array(16);
  e.getRandomValues(t);
  return t;
}

function i(){
    var e = c();
    var i="";
    for(var t=0;t<e.length;t++)i+=String.fromCharCode(e[t]);
    return i;
}

export function generate() {
	return i();
}