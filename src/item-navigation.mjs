// Scope arrows to the focused primary item. Never intercept editing, modified
// shortcuts or secondary controls (read toggles, annotation actions, etc.).
export function navigateItems(event, selector, {axis = 'vertical', activate = false} = {}) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent?.isComposing) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  const item = target.closest(selector);
  if (!item || !event.currentTarget.contains(item) || target.closest('button,a,[role="button"]') !== item) return;
  const items = [...event.currentTarget.querySelectorAll(selector)].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
  const index = items.indexOf(item);
  if (index < 0) return;
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if ((axis !== 'horizontal' && event.key === 'ArrowDown') || (axis !== 'vertical' && event.key === 'ArrowRight')) next = Math.min(index + 1, items.length - 1);
  else if ((axis !== 'horizontal' && event.key === 'ArrowUp') || (axis !== 'vertical' && event.key === 'ArrowLeft')) next = Math.max(index - 1, 0);
  else return;
  event.preventDefault();
  const destination = items[next];
  destination.focus({preventScroll: true});
  destination.scrollIntoView({block: 'nearest', inline: 'nearest'});
  if (activate && destination !== item) destination.click();
}
