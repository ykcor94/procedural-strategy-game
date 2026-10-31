/** Icon set for the in-game panels: goods, industries, taxes, policies and programmes. Symbols are appended
 * to the page sprite once; `icon(name)` returns markup. Strokes follow currentColor like the base sprite. */
const P={
  // goods
  grain:'<path d="M12 21V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5Zm0 0c2-1 3-3 3-5-2 0-3 2-3 5ZM12 13c-2.5-.5-4-2.5-4-4.5 2.5.3 4 2.3 4 4.5Zm0 0c2.5-.5 4-2.5 4-4.5-2.5.3-4 2.3-4 4.5ZM12 18c-2.5-.5-4-2.5-4-4.5 2.5.3 4 2.3 4 4.5Zm0 0c2.5-.5 4-2.5 4-4.5-2.5.3-4 2.3-4 4.5Z"/>',
  livestock:'<path d="M5 10c0-2 2-3.5 4-3.5h6c2 0 4 1.5 4 3.5v3c0 1.5-1 2.5-2.5 2.5H16v3M8 15.5V19M5 10 3 8.5M19 10l2-1.5M9 11h.01M15 11h.01M10 14h4"/>',
  fish:'<path d="M3.5 12c3-4 7.5-5 11-3.5 2 .8 3.5 2.2 4.5 3.5-1 1.3-2.5 2.7-4.5 3.5C11 17 6.5 16 3.5 12Zm0 0L2 9m1.5 3L2 15M15.5 11h.01"/>',
  timber:'<path d="M12 3 6 11h3l-4 6h14l-4-6h3ZM12 17v4"/>',
  fibres:'<circle cx="12" cy="12" r="7"/><path d="M6 9.5c4 0 8 1.5 12 5M5.5 13c4.5 0 8.5 1.5 11.5 4.5M8 6c3 1 6 3.5 9 7.5"/>',
  fruit:'<circle cx="12" cy="14" r="6"/><path d="M12 8c0-2 1-4 3-5M12 8c-2-2-4-2-6-1 1 2 3 2.5 6 1"/>',
  iron:'<path d="M4 17 8 8h8l4 9ZM8 8l2 9M16 8l-2 9M5.5 13.5h13"/>',
  copper:'<path d="M5 16 9 7l3 5 3-3 4 7Z"/><circle cx="16" cy="7" r="1.6"/>',
  coal:'<path d="M5 15l2-6 5-2 5 3 2 5-4 4H8Z"/><path d="M9 12l3-1 2 2"/>',
  oil:'<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11Z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  precious:'<path d="M4 14h7l1.5 4h-10ZM12.5 14h7l1.5 4h-10ZM8 9h8l1.5 4h-11Z"/>',
  stone:'<path d="M4 18 6 9l5-3 6 2 3 6-3 4Z"/><path d="M6 9l5 3 6-4M11 12v6"/>',
  salt:'<path d="M8 4h8l1 4H7Z"/><path d="M7 8h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z"/><path d="M10 6h.01M14 6h.01M12 6h.01"/>',
  gem:'<path d="M6 4h12l3 5-9 11L3 9Z"/><path d="M3 9h18M9 4l3 16M15 4l-3 16"/>',
  food:'<path d="M4 11h16a8 8 0 0 1-16 0ZM7 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M17 7c0-1.5 1-2 1-3"/>',
  goods:'<path d="M4 8 12 4l8 4v9l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v9"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  bolt:'<path d="M13 3 5 14h6l-1 7 8-11h-6Z"/>',
  // industries
  farm:'<path d="M3 20h18M5 20v-8l4-3 4 3v8M13 20v-5h6v5M9 20v-4"/><path d="M15 15V9l2-2 2 2v6"/>',
  ranch:'<path d="M3 20h18M4 20V11M20 20V11M4 13h16M4 17h16"/>',
  boat:'<path d="M3 15h18l-3 5H6ZM12 15V4l6 9h-6"/>',
  saw:'<path d="M4 17 17 4l3 3L7 20Z"/><path d="m8 13 1 1M11 10l1 1M14 7l1 1"/>',
  pick:'<path d="M4 20 14 10M9 5c4-2 8-1 11 2-3-1-6-1-9 1M14 10l-3-3"/>',
  anvil:'<path d="M4 8h12c0 3 2 4 4 4v1H8c-2 0-3 1-3 3v1h11v3H4v-3h1"/>',
  shirt:'<path d="M8 4 4 7l2 4 2-1v10h8V10l2 1 2-4-4-3c-1 2-2.5 3-4 3S9 6 8 4Z"/>',
  can:'<ellipse cx="12" cy="6" rx="6" ry="2"/><path d="M6 6v12c0 1 2.7 2 6 2s6-1 6-2V6M6 11h12"/>',
  crane:'<path d="M5 21V4h1l13 4H6M9 21V8M14 8v5M13 13h2v2h-2Z"/><path d="M3 21h8"/>',
  ship:'<path d="M3 15h18l-2.5 5h-13ZM6 15V9h12v6M9 9V5h6v4"/>',
  bank:'<path d="M3 9 12 4l9 5ZM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3 20h18"/>',
  palm:'<path d="M12 21c0-5 .5-9 2-12M14 9c-2-3-6-3-8-1 3 0 5 .5 8 1Zm0 0c1-3 5-4 7-3-2 1-4 2-7 3Zm0 0c3 0 5 2 5 5-2-2-3.5-3.5-5-5Z"/><path d="M4 21h16"/>',
  flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9"/>',
  // money and state
  coins:'<ellipse cx="9" cy="7" rx="5" ry="2.2"/><path d="M4 7v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V7"/><ellipse cx="15" cy="14" rx="5" ry="2.2"/><path d="M10 14v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4"/>',
  wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  office:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  cart:'<path d="M3 4h2l2 11h11l2-8H6.5"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  house:'<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
  mineshaft:'<path d="M4 20 9 6h6l5 14M7 13h10M12 6V3"/>',
  customs:'<path d="M4 20V8l8-4 8 4v12M8 20v-6h8v6M4 10h16"/>',
  anchor:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 11h8"/>',
  shield:'<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6Z"/>',
  heart:'<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
  graduation:'<path d="M2 9 12 4l10 5-10 5ZM6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  percent:'<path d="M6 18 18 6"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
  // trade and diplomacy
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z"/>',
  handshake:'<path d="M2 11 6 7l4 2 3-2h3l6 4M6 7l-4 9h3l2 2M22 11l-3 6-3 1-4-3M10 9l-2 3 2 1 3-2 3 3"/>',
  ban:'<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  bloc:'<circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="12" cy="15.5" r="4"/>',
  contract:'<path d="M7 3h8l4 4v14H7Z"/><path d="M15 3v4h4M10 12h6M10 16h4"/>',
  // demography
  passport:'<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
  tent:'<path d="M3 20 12 5l9 15ZM12 5v15M9 20l3-5 3 5"/>',
  speech:'<path d="M4 5h16v10H10l-5 4v-4H4Z"/><path d="M8 9h8M8 12h5"/>',
  temple:'<path d="M3 9 12 4l9 5M5 9v9M19 9v9M9 9v9M15 9v9M3 20h18"/>',
  cradle:'<path d="M4 10h16a8 6 0 0 1-16 0ZM4 10a8 8 0 0 1 8-6v6M8 19l-1 2M16 19l1 2"/>',
  cross:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  book:'<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1Z"/><path d="M12 6v14"/>',
  scroll:'<path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z"/><path d="M10 9h5M10 12h5"/>',
  wagon:'<path d="M3 15h18M5 15V9h14v6M5 9c0-3 3-5 7-5s7 2 7 5"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  city:'<path d="M3 21h18M5 21V10h5v11M10 21V5h6v16M16 21v-8h3v8M7 13h1M7 16h1M12.5 8h1M12.5 11h1M12.5 14h1"/>',
  clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8 10h8M8 14h8M8 18h5"/>',
  pyramid:'<path d="M9 5h6M7 9h10M5 13h14M3 17h18"/>',
  baby:'<circle cx="12" cy="8" r="3.5"/><path d="M6 21c0-4 2.5-7 6-7s6 3 6 7"/>',
  // misc
  atlas:'<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>',
  robot:'<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 13h.01M15 13h.01M9.5 16h5M3 12v3M21 12v3"/><circle cx="12" cy="4" r="1"/>',
  warning:'<path d="M12 4 2.5 20h19Z"/><path d="M12 10v4M12 17v.01"/>',
  star:'<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/>',
  up:'<path d="m5 15 7-7 7 7"/>',
  down:'<path d="m5 9 7 7 7-7"/>',
  chart:'<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  news:'<rect x="3" y="5" width="15" height="15" rx="1"/><path d="M18 9h3v9a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4"/>',
  eye:'<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  park:'<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8"/>',
  monument:'<path d="M10 21V7l2-4 2 4v14M7 21h10M8 17h8"/>',
  stadium:'<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="4.5" ry="2"/>',
  library:'<path d="M4 20V5h4v15M8 20V8h4v12M13 20 15 6l4 .5-2 13.5M3 20h18"/>',
  road:'<path d="M8 3 5 21M16 3l3 18M12 4v3M12 10v4M12 17v3"/>',
  port:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 11h8"/>',
};
export const ICON_NAMES=Object.freeze(Object.keys(P));
export function installIcons(){
  const sprite=document.querySelector('.icon-sprite');if(!sprite||sprite.querySelector('#i-grain'))return;
  sprite.insertAdjacentHTML('beforeend',Object.entries(P).map(([k,v])=>`<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join(''));
}
export const icon=(name,cls='')=>`<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
/** Industry → icon. */
export const INDUSTRY_ICON=Object.freeze({farming:'farm',herding:'ranch',fishing:'boat',forestry:'saw',mining:'pick',energy:'bolt',heavy:'anvil',light:'shirt',food:'can',construction:'crane',trade:'ship',finance:'bank',tourism:'palm',knowledge:'flask'});
export const TAX_ICON=Object.freeze({income:'wallet',corporate:'office',consumption:'cart',property:'house',royalty:'mineshaft',tariff:'customs',fees:'anchor',enterprise:'factory'});
export const SPEND_ICON=Object.freeze({admin:'clipboard',services:'graduation',welfare:'heart',security:'shield',subsidies:'coins',upkeep:'crane',interest:'percent',population:'people',fund:'robot'});
export const BUILDING_ICON=Object.freeze({housing:'house',port:'port',road:'road',monument:'monument',park:'park',temple:'temple',library:'library',stadium:'stadium'});
export const LAW_ICON=Object.freeze({tax:'percent',ideology:'scales',trade:'ship',welfare:'heart',labour:'people',fdi:'globe',industry:'factory',land:'farm',money:'coins'});
