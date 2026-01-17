(function(){
  "use strict";

  const root = document.getElementById("mmd-customer-understanding");
  if(!root) return;

  const bar = document.getElementById("mmdcu-bar");
  const pct = document.getElementById("mmdcu-pct");
  const btn = document.getElementById("mmdcu-done");

  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

  let unlocked = false;

  function update(){
    const doc = document.documentElement;
    const st = doc.scrollTop || document.body.scrollTop || 0;
    const sh = (doc.scrollHeight || document.body.scrollHeight || 1) - doc.clientHeight;
    const p = sh <= 0 ? 100 : clamp(Math.round((st / sh) * 100), 0, 100);

    if(bar) bar.style.width = p + "%";
    if(pct) pct.textContent = p + "%";

    if(!unlocked && p >= 95){
      unlocked = true;
      if(btn) btn.disabled = false;
      try{
        window.parent && window.parent.postMessage(
          { type: "mmd_customer_rules_read_complete", href: location.href },
          "*"
        );
      }catch(_){}
    }
  }

  window.addEventListener("scroll", update, { passive:true });
  window.addEventListener("resize", update);
  update();

  if(btn){
    btn.addEventListener("click", ()=>{
      try{
        window.parent && window.parent.postMessage(
          { type: "mmd_customer_rules_read_complete", href: location.href, via: "button" },
          "*"
        );
      }catch(_){}
      btn.textContent = "รับทราบแล้ว";
      btn.disabled = true;
    });
  }
})();
