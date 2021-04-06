function c(e){return"undefined"!=typeof btoa?btoa(String.fromCharCode.apply(null,e)):"undefined"!=typeof Buffer?Buffer.from(String.fromCharCode.apply(null,e),"binary").toString("base64"):(function(e){for(var t,n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",a=[],r=0,i=e.length,o=i%3,s=i-o;r<s;){t=e[r]<<16
t|=e[r+1]<<8
t|=e[r+2]
a.push(n.charAt(t>>>18&63))
a.push(n.charAt(t>>>12&63))
a.push(n.charAt(t>>>6&63))
a.push(n.charAt(63&t))
r+=3}switch(o){case 2:t=e[r]<<16
t|=e[r+1]<<8
a.push(n.charAt(t>>>18&63))
a.push(n.charAt(t>>>12&63))
a.push(n.charAt(t>>>6&63))
a.push("=")
break
case 1:t=e[r]<<16
a.push(n.charAt(t>>>18&63))
a.push(n.charAt(t>>>12&63))
a.push("=")
a.push("=")}return a.join("")})(e)}

function t(e){return(t="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e})(e)}
for(var n,a=((
  function(e){
    var t="undefined"!=typeof crypto&&crypto.getRandomValues&&crypto.getRandomValues.bind(crypto)||"undefined"!=typeof msCrypto&&"function"==typeof window.msCrypto.getRandomValues&&msCrypto.getRandomValues.bind(msCrypto)
    if(t){
      var n=new Uint8Array(16)
      e.exports=function(){
	    t(n)
        return n
      }
    }else{
      var a=new Array(16)
      e.exports=function(){
	    for(var e,t=0;t<16;t++){
		    0==(3&t)&&(e=4294967296*Math.random())
            a[t]=e>>>((3&t)<<3)&255
	    }
		return a
	  }
    }
  }
)(
n={exports:{}},n.exports),n.exports),r=[],i=0;i<256;++i)r[i]=(i+256).toString(16).substr(1)
var o=function(e,t){
  var n=t||0,a=r
  return[a[e[n++]],a[e[n++]],a[e[n++]],a[e[n++]],"-",a[e[n++]],a[e[n++]],"-",a[e[n++]],a[e[n++]],"-",a[e[n++]],a[e[n++]],"-",a[e[n++]],a[e[n++]],a[e[n++]],a[e[n++]],a[e[n++]],a[e[n++]]].join("")
}

var s=function(e,t,n){
  var r=t&&n||0
  if("string"==typeof e){
    t="binary"===e?new Array(16):null
    e=null
  }
  var i=(e=e||{}).random||(e.rng||a)()
  i[6]=15&i[6]|64
  i[8]=63&i[8]|128
  if(t)for(var s=0;s<16;++s)t[r+s]=i[s]
  return t||o(i)
}

export function generate() {
	return c(s(null,new Uint8Array(16),0));
}
