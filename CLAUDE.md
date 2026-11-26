# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Maia - Cateringpaket" is a single-file WooCommerce plugin (`cateringpaket.php`) plus two plain assets (`assets/cateringpaket.js`, `assets/cateringpaket.css`). It turns a WooCommerce product into a catering "package": the customer picks number of people (quantity = people, with a minimum), then distributes that number across choices in one or more groups using +/- steppers, and sees a running total.

There is no build step, package manager, linter config or test suite. JS is vanilla ES2015+ (no bundler, no jQuery); CSS is hand-written. To try changes, the plugin must run inside a WordPress + WooCommerce site (requires WP 6.0+, PHP 7.4+, WC 7.0+). Quick syntax check: `php -l cateringpaket.php`.

Code (comments, identifiers, CSS classes) is in English, but all customer- and admin-facing text is **Swedish** and must stay Swedish. The `cateringpaket` slug (text domain, handles, function/constant prefix) and the stored meta keys `_cateringpaket_enabled`/`_cateringpaket_min` are kept as-is; renaming the meta keys would lose existing product settings.

## Architecture

**The plugin does not store the package choices itself.** The groups and options come from a separate, third-party plugin ("Product input fields" / an add-ons plugin) that renders extra fields inside `form.cart`. This plugin only:

1. **PHP (server side)**
   - Adds two product meta fields in the admin General tab: `_cateringpaket_enabled` (`yes`/`no`) and `_cateringpaket_min` (default 10). `cateringpaket_min($product)` is the single source of truth — it returns 0 for non-package products, so every hook gates on it.
   - Enforces the minimum via `woocommerce_quantity_input_args` and `woocommerce_add_to_cart_validation`.
   - Rewrites price HTML on the product page to "X kr per person, ink moms", adds the `cateringpaket-produkt` body class.
   - Enqueues CSS/JS only on package product pages and injects `window.CateringpaketConfig = { price, min }` inline before the script.
   - Adds `data-no-optimize` / `data-no-defer` / `data-cfasync` to the script tag so optimisation plugins don't defer/combine it. Declares HPOS compatibility (plugin never touches orders).

2. **JS (client side) — DOM scraping of the add-ons plugin's fields**
   - Finds the `form.cart` containing extra `input`s besides the quantity field (retries up to 10× at 500 ms since the add-ons plugin may render late).
   - `buildGroups` walks the fields container in DOM order: any non-input element with text (e.g. a *Paragraph* field) starts a new group and becomes its heading; each following number input becomes an option in that group. Option names come from `labelText()` heuristics.
   - Hides the original fields with `.up-hidden` (they stay in the form and are submitted normally) and inserts its own `.up-paket` UI before the add-to-cart button.
   - All writes go through `setValue()`, which dispatches `input` + `change` so the add-ons plugin and theme see the changes. The visible people count writes to the real WooCommerce quantity input.
   - The add-to-cart button is disabled until every group's selections sum exactly to the number of people.

Because the JS depends on the add-ons plugin's markup, the theme (Elementor) and possible optimisation plugins, changes to selectors/DOM walking should be tested against the actual product page. CSS uses many `!important` overrides deliberately to beat theme/Elementor button and input styles; classes are prefixed `up-`.

Asset URLs are versioned with each file's `filemtime`, so cache busting is automatic. `CATERINGPAKET_VERSION` is only a fallback if the file can't be read.
