---
'@qa-ai-stlc/explorer': minor
---

Ship the Kendo UI for Angular component-library profile, selected with `ui.componentLibrary: kendo-angular`. DropDownList, ComboBox, MultiSelect, DatePicker, NumericTextBox, TabStrip, Window and Grid are registered once, on their `kendo-*` host element, with the inputs and buttons rendered inside it left out and the library's generated `k-` ids rejected. Also fixes a widget named by several `aria-labelledby` ids being split on the letter "s" instead of on whitespace, which left widgets whose label id contained an "s" unnamed.
