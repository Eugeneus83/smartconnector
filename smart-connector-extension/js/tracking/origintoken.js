for(var s="function"==typeof Buffer?Buffer:Array,l=[],c={},d=0;d<256;d++){l[d]=(d+256).toString(16).substr(1)
c[l[d]]=d}

function u(e,t){var i=t||0,n=l
return n[e[i++]]+n[e[i++]]+n[e[i++]]+n[e[i++]]+"-"+n[e[i++]]+n[e[i++]]+"-"+n[e[i++]]+n[e[i++]]+"-"+n[e[i++]]+n[e[i++]]+"-"+n[e[i++]]+n[e[i++]]+n[e[i++]]+n[e[i++]]+n[e[i++]]+n[e[i++]]
}

function i(){
  var e=window.crypto||window.msCrypto;
  var t=new Uint8Array(16)
  e.getRandomValues(t)
  return t
}

function m(e,t,n){
	var r=t&&n||0
    if("string"==typeof e){t="binary"===e?new s(16):null
    e=null}var a=(e=e||{}).random||(e.rng||i)()
    a[6]=15&a[6]|64
    a[8]=63&a[8]|128
    if(t)for(var o=0;o<16;o++)t[r+o]=a[o]
    return t||u(a)
}

export function generate() {
	return m();
}