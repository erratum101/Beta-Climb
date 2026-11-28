var C=2000
self.addEventListener('install',function(){self.skipWaiting()})
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())})
function on(){return caches.open('bc-net').then(function(c){return c.match('/__bc-stitch')})}
function rg(u,a,b){return fetch(u,{headers:{Range:'bytes='+a+'-'+b}})}
function stitch(u,a,b){
  var n=Math.ceil((b-a+1)/C),p=new Array(n),i=0
  function w(){
    if(i>=n)return Promise.resolve()
    var k=i++,s=a+k*C,e=Math.min(s+C-1,b)
    return rg(u,s,e).then(function(r){if(!r.ok)throw 0;return r.arrayBuffer()}).then(function(buf){p[k]=buf;return w()})
  }
  return Promise.all([w(),w(),w(),w()]).then(function(){return new Blob(p).arrayBuffer()})
}
function load(q){
  return on().then(function(f){
    if(!f)return fetch(q)
    return rg(q.url,0,0).then(function(h){
      var t=+((h.headers.get('content-range')||'').split('/')[1]||0)
      var type=h.headers.get('content-type')||'application/octet-stream'
      if(!t||t<=C)return fetch(q)
      var m=(q.headers.get('range')||'').match(/bytes=(\d+)-(\d*)/)
      var s=0,e=t-1,st=200
      if(m){s=+m[1];e=m[2]?+m[2]:Math.min(s+1048575,t-1);st=206}
      if(e-s>2097151||e-s+1<=C)return fetch(q)
      return stitch(q.url,s,e).then(function(buf){
        var hd={'Content-Type':type,'Content-Length':''+buf.byteLength}
        if(st==206)hd['Content-Range']='bytes '+s+'-'+e+'/'+t
        return new Response(buf,{status:st,headers:hd})
      })
    })
  })
}
self.addEventListener('fetch',function(ev){
  var q=ev.request
  if(q.method!='GET')return
  var u=new URL(q.url)
  if(u.origin!=self.location.origin||u.pathname.indexOf('/api/')==0)return
  ev.respondWith(load(q).catch(function(){return fetch(q)}))
})
