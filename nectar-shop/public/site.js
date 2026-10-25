
var A={hair:{n:'Haircare',k:'ಕೂದಲ ಆರೈಕೆ',img:'/img/48edc668.webp',t:'Shelves of shampoos and conditioners, oils and colour.',l:[['Shampoos &amp; conditioners','Dove, Tresemmé, L’Oréal, Clinic Plus, Sunsilk'],['Hair oils &amp; treatments','Coconut and almond oils, serums, masks'],['Hair colours &amp; dyes','Box kits, developer, salon solutions']]},
body:{n:'Bodycare',k:'ದೇಹದ ಆರೈಕೆ',img:'/img/216e8119.webp',t:'Soaps, lotions and grooming for the whole family.',l:[['Soaps &amp; body washes','Pears, Fiama, moisturising ranges'],['Lotions &amp; creams','Nivea, Vaseline, hydration care'],['Men’s grooming','Gillette shaving, deodorants, face wash']]},
make:{n:'Makeup &amp; parlour',k:'ಮೇಕಪ್ ಮತ್ತು ಪಾರ್ಲರ್',img:'/img/e82245b2.webp',t:'Lip, face and eye makeup, plus salon supplies.',l:[['Lip care &amp; colour','Lipsticks, glosses, liners'],['Face makeup','Foundations, powders, primers, BB/CC'],['Eye makeup','Eyeliners, mascaras, kajal, shadows'],['Skincare &amp; facial kits','Bleach, cleanups, masks']]},
baby:{n:'Baby care &amp; essentials',k:'ಮಕ್ಕಳ ಆರೈಕೆ',img:'/img/eafbf2d3.webp',t:'Everyday basics, easy to grab on the way home.',l:[['Diapers &amp; wipes','Huggies, baby wipes'],['Baby lotions &amp; soaps','Gentle daily care'],['Everyday essentials','Hand wash, sanitary and household basics']]}};
var tabs=document.getElementById('tabs'),box=document.getElementById('aisle');tabs.innerHTML='';box.innerHTML='';
function show(id){for(var b of tabs.children)b.setAttribute('aria-selected',b.dataset.id==id);var a=A[id];
box.innerHTML='<img class="fade" src="'+a.img+'" alt="'+a.n+' aisle"><div><h3>'+a.n+'</h3><p class="k" style="color:var(--gold);margin:4px 0 8px">'+a.k+'</p><p style="color:var(--mute);margin:0">'+a.t+'</p><ul>'+a.l.map(function(x){return '<li><b>'+x[0]+'</b><br><span style="color:var(--mute)">'+x[1]+'</span></li>'}).join('')+'</ul></div>'}
for(var id in A){var b=document.createElement('button');b.dataset.id=id;b.setAttribute('role','tab');b.innerHTML=A[id].n;b.onclick=(function(i){return function(){show(i)}})(id);tabs.appendChild(b)}
show('hair');

var nl=document.getElementById('nl'),mb=document.querySelector('.menu');
mb.onclick=function(){var o=nl.classList.toggle('open');mb.setAttribute('aria-expanded',o);mb.textContent=o?'✕':'☰'};
nl.onclick=function(e){if(e.target.tagName=='A'){nl.classList.remove('open');mb.textContent='☰';mb.setAttribute('aria-expanded',false)}};
var lb=document.getElementById('lb'),li=lb.querySelector('img');
document.querySelectorAll('.gal img').forEach(function(i){i.onclick=function(){li.src=i.src;li.alt=i.alt;lb.showModal()}});
lb.onclick=function(e){if(e.target!=li)lb.close()};
var R=document.documentElement.style;
document.querySelectorAll('.ring button').forEach(function(b){b.onclick=function(){document.querySelectorAll('.ring button').forEach(function(x){x.setAttribute('aria-pressed',x==b)});R.setProperty('--glow',b.dataset.g)}});
addEventListener('pointermove',function(e){R.setProperty('--mx',e.clientX+'px');R.setProperty('--my',e.clientY+'px')});
(function(){var c=document.getElementById('d'),x=c.getContext('2d'),P=[],W,H;if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
function rs(){W=c.width=innerWidth;H=c.height=innerHeight}rs();addEventListener('resize',rs);
for(var i=0;i<55;i++)P.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.8+.4,v:Math.random()*.25+.05,p:Math.random()*6});
(function f(t){x.clearRect(0,0,W,H);P.forEach(function(p){p.y-=p.v;p.x+=Math.sin(t/2500+p.p)*.25;if(p.y<-5){p.y=H+5;p.x=Math.random()*W}
x.globalAlpha=.25+.35*Math.sin(t/900+p.p)**2;x.fillStyle='#f3cf94';x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()});requestAnimationFrame(f)})(0)})();
