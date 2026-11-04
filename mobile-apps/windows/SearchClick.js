/* global document */
(() => {
  "use strict";
  const button = document.querySelector(
    'button[data-dovebevo-search="1"], .top__row button.search-field',
  );
  if (!button) return false;
  button.click();
  return true;
})();
