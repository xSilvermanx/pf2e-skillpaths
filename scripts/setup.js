const MODULE_ID = "pf2e-skillpaths";
const PACK_NAME = "pf2e-skillpath-compendium";
const PACK_ID = `${MODULE_ID}.${PACK_NAME}`;

const SOURCE_NAME = "PF2e Skillpaths";
const SOURCE_SLUG = "pf2e-skillpaths";

Hooks.once("ready", async () => {
  if (game.system.id !== "pf2e") return;
  
  if (game.user.isGM) {
    await enableSkillpathPackInBrowser();
  }

  patchFeatBrowserSkillpathFilter();

  const pack = game.packs.get(PACK_ID);
  if (!pack) {
    console.warn(`${MODULE_ID} | Pack not found: ${PACK_ID}`);
    return;
  }

  try {
    const packsSetting = foundry.utils.deepClone(
      game.settings.get("pf2e", "compendiumBrowserPacks")
    );

    if (!packsSetting.feats) packsSetting.feats = {};
    if (!packsSetting.feats[PACK_ID]) {
      packsSetting.feats[PACK_ID] = {
        load: true,
        name: pack.metadata.label ?? "PF2e Skillpath Compendium"
      };
    } else {
      packsSetting.feats[PACK_ID].load = true;
    }

    await game.settings.set("pf2e", "compendiumBrowserPacks", packsSetting);

    const sourcesSetting = foundry.utils.deepClone(
      game.settings.get("pf2e", "compendiumBrowserSources")
    );

    if (!sourcesSetting.feats) sourcesSetting.feats = {};
    if (!sourcesSetting.feats[SOURCE_SLUG]) {
      sourcesSetting.feats[SOURCE_SLUG] = {
        load: true,
        name: SOURCE_NAME
      };
    } else {
      sourcesSetting.feats[SOURCE_SLUG].load = true;
    }

    await game.settings.set("pf2e", "compendiumBrowserSources", sourcesSetting);

    console.log(`${MODULE_ID} | Enabled pack in PF2e Compendium Browser: ${PACK_ID}`);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not auto-enable PF2e Compendium Browser pack`, error);
  }
});

async function enableSkillpathPackInBrowser() {
  const pack = game.packs.get(PACK_ID);

  if (!pack) {
    console.warn(`${MODULE_ID} | Pack not found: ${PACK_ID}`);
    return;
  }

  try {
    const packsSetting = foundry.utils.deepClone(
      game.settings.get("pf2e", "compendiumBrowserPacks")
    );

    packsSetting.feats ??= {};

    packsSetting.feats[PACK_ID] ??= {
      load: true,
      name: pack.metadata.label ?? "PF2e Skillpath Compendium"
    };

    packsSetting.feats[PACK_ID].load = true;

    await game.settings.set("pf2e", "compendiumBrowserPacks", packsSetting);

    console.log(`${MODULE_ID} | Enabled PF2e Compendium Browser pack: ${PACK_ID}`);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not enable PF2e Compendium Browser pack`, error);
  }
}

function patchFeatBrowserSkillpathFilter() {
  const browser = game.pf2e?.compendiumBrowser;

  if (!browser?.openTab || browser._skillpathsPatchedOpenTab) return;

  const originalOpenTab = browser.openTab.bind(browser);

  browser.openTab = async function patchedOpenTab(tabName, filter = {}, ...rest) {
	console.log(`${MODULE_ID} | openTab`, tabName, foundry.utils.deepClone(filter));
	
    if (tabName === "feat" && shouldAddSkillpathTrait(filter)) {
      filter = addSkillpathTraitFilter(filter);
	}

	return originalOpenTab(tabName, filter, ...rest);
  };

  browser._skillpathsPatchedOpenTab = true;

  console.log(`${MODULE_ID} | Patched PF2e feat browser default Skillpath filter.`);
}

function shouldAddSkillpathTrait(openTabFilter) {
  const categoryFilter = openTabFilter?.filter?.checkboxes?.category;

  if (!categoryFilter) return false;

  const selectedCategories = collectSelectedFilterValues(categoryFilter);

  console.log(`${MODULE_ID} | selected feat categories:`, Array.from(selectedCategories));

  return selectedCategories.has("skill") || selectedCategories.has("general");
}

function collectSelectedFilterValues(filterSection) {
  const selected = new Set();

  // Fall 1: selected ist ein Array von Strings oder Objekten
  if (Array.isArray(filterSection.selected)) {
    for (const value of filterSection.selected) {
      if (typeof value === "string") {
        selected.add(value);
      } else if (value?.value) {
        selected.add(value.value);
      }
    }
  }

  // Fall 2: selected ist ein einzelner String
  if (typeof filterSection.selected === "string") {
    selected.add(filterSection.selected);
  }

  // Fall 3: options enthalten selected/checked
  const options = Array.isArray(filterSection.options)
    ? filterSection.options
    : Object.values(filterSection.options ?? {});

  for (const option of options) {
    if (option?.selected === true || option?.checked === true) {
      if (option.value) selected.add(option.value);
      else if (option.key) selected.add(option.key);
    }
  }

  return selected;
}

function collectSelectedCategories(filter) {
  const categories = new Set();

  if (!filter || typeof filter !== "object") return categories;

  // Simple possible forms
  if (typeof filter.category === "string") {
    categories.add(filter.category);
  }

  if (Array.isArray(filter.category)) {
    for (const value of filter.category) categories.add(value);
  }

  if (Array.isArray(filter.categories)) {
    for (const value of filter.categories) categories.add(value);
  }

  // Common PF2e browser-ish nested forms
  const categoryFilter =
    filter.checkboxes?.category ??
    filter.checkboxes?.categories ??
    filter.multiselects?.category ??
    filter.multiselects?.categories;

  if (categoryFilter?.selected) {
    for (const selected of asArray(categoryFilter.selected)) {
      if (typeof selected === "string") categories.add(selected);
      if (selected?.value) categories.add(selected.value);
    }
  }

  if (categoryFilter?.options) {
    for (const [key, option] of Object.entries(categoryFilter.options)) {
      if (option?.selected === true) categories.add(key);
      if (option?.value && option?.selected === true) categories.add(option.value);
    }
  }

  return categories;
}

function addSkillpathTraitFilter(openTabFilter) {
  const copy = foundry.utils.deepClone(openTabFilter ?? {});

  const traits = copy?.filter?.traits;

  if (!traits) {
    console.warn(`${MODULE_ID} | No traits filter found.`);
    return copy;
  }

  const options = Array.isArray(traits.options)
    ? traits.options
    : Object.values(traits.options ?? {});

  const skillpathOption = options.find(option => option?.value === "skillpath");

  if (!skillpathOption) {
    console.warn(`${MODULE_ID} | Skillpath trait option not found.`);
    return copy;
  }

  traits.selected ??= [];

  const alreadySelected = traits.selected.some(selected => {
    if (typeof selected === "string") return selected === "skillpath";
    return selected?.value === "skillpath";
  });

  if (!alreadySelected) {
    traits.selected.push(skillpathOption);
  }

  console.log(`${MODULE_ID} | Added Skillpath trait filter:`, skillpathOption);

  return copy;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}