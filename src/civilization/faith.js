/** How strongly a government suppresses non-affiliation (1 = not at all). Theocracies keep No Religion a
 * small minority; secular socialist states slightly raise it. Used by generation and the campaign. */
export function stateFaithFactor(nation){
  const s=`${nation?.government||''} ${nation?.ideology||''}`.toLowerCase();
  if(/theocra|hierophant|holy/.test(s))return .18;
  if(/relig/.test(s))return .4;
  if(/absolute monarch|elective monarch|elective tradition/.test(s))return .75;
  if(/commun|socialist/.test(s))return 1.25;
  return 1;
}
