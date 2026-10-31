export function initTheme(button) {
  let saved;try{saved=localStorage.getItem('atlas-theme');}catch{}
  let theme=saved||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
  const apply=()=>{document.documentElement.dataset.theme=theme;button.innerHTML=`<svg class="icon"><use href="#i-${theme==='dark'?'sun':'moon'}"/></svg>`;button.title=`Switch to ${theme==='dark'?'light':'dark'} mode`;button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',theme==='dark');};
  apply();button.onclick=()=>{theme=theme==='dark'?'light':'dark';apply();try{localStorage.setItem('atlas-theme',theme);}catch{}};
}
