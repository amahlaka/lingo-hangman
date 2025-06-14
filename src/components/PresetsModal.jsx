import React from "react";
import { Dialog } from "@headlessui/react";
import { Button } from "@/components/ui/button";

export default function PresetsModal({ open, onClose, categories, setCategories, allCategories, onAdd, matchCount, numToAdd, setNumToAdd, excludedCategories, setExcludedCategories, t }) {
  const toggleExclude = (cat) => {
    if (excludedCategories.includes(cat)) {
      setExcludedCategories(excludedCategories.filter(c => c !== cat));
    } else {
      setExcludedCategories([...excludedCategories, cat]);
      setCategories(categories.filter(c => c !== cat));
    }
  };
  const toggleInclude = (cat) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter(c => c !== cat));
    } else {
      setCategories([...categories, cat]);
      setExcludedCategories(excludedCategories.filter(c => c !== cat));
    }
  };

  // Cycle category state: neutral -> selected -> excluded -> neutral
  const cycleCategory = (cat) => {
    if (!categories.includes(cat) && !excludedCategories.includes(cat)) {
      // Neutral -> selected
      setCategories([...categories, cat]);
    } else if (categories.includes(cat)) {
      // Selected -> excluded
      setCategories(categories.filter(c => c !== cat));
      setExcludedCategories([...excludedCategories, cat]);
    } else if (excludedCategories.includes(cat)) {
      // Excluded -> neutral
      setExcludedCategories(excludedCategories.filter(c => c !== cat));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center">
      <div className="fixed inset-0 bg-neutral-950/80" aria-hidden="true" />
      <div className="relative bg-white dark:bg-neutral-900 rounded-lg shadow-lg max-w-md w-full p-6 z-10 max-h-[90vh] overflow-y-auto">
        <Dialog.Title className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">{t.selectCategories || "Select categories"}</Dialog.Title>
        {/* Organized category grid for better clarity */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {allCategories.map(cat => (
            <div key={cat} className="flex items-center gap-1 border rounded px-2 py-1 bg-white dark:bg-neutral-800 shadow-sm min-w-0"
              style={{
                background: excludedCategories.includes(cat)
                  ? "#fee2e2"
                  : categories.includes(cat)
                  ? "#d1fae5"
                  : undefined,
                borderColor: excludedCategories.includes(cat)
                  ? "#f87171"
                  : categories.includes(cat)
                  ? "#34d399"
                  : "#d1d5db"
              }}
            >
              <input
                type="checkbox"
                checked={categories.includes(cat)}
                onChange={() => toggleInclude(cat)}
                className="accent-blue-600"
                disabled={excludedCategories.includes(cat)}
                aria-label={t.selectCategoryLabel ? t.selectCategoryLabel.replace('{category}', cat) : `Select category: ${cat}`}
              />
              <span
                className={`text-xs truncate flex-1 cursor-pointer ${
                  excludedCategories.includes(cat)
                    ? "text-black line-through bg-red-100"
                    : categories.includes(cat)
                    ? "text-gray-900 font-bold"
                    : "text-gray-900 dark:text-gray-100"
                }`}
                title={cat}
                onClick={() => cycleCategory(cat)}
              >
                {t[cat] || cat}
              </span>
              <button
                type="button"
                className={`ml-1 text-xs px-1 rounded ${excludedCategories.includes(cat) ? "bg-red-500 text-white" : "bg-neutral-200 dark:bg-neutral-700 text-gray-900 dark:text-gray-100"}`}
                onClick={() => toggleExclude(cat)}
                aria-label={excludedCategories.includes(cat) ? (t.unexclude || "Unexclude") : (t.exclude || "Exclude")}
                style={{ minWidth: 22 }}
              >
                {excludedCategories.includes(cat) ? (t.unexcludeIcon || "✖") : (t.excludeIcon || "🚫")}
              </button>
            </div>
          ))}
        </div>
        <div className="mb-4 text-sm text-gray-900 dark:text-gray-100">
          {t.presetsMatchCount
            ? t.presetsMatchCount.replace("{count}", matchCount)
            : `${matchCount} matching words in selected categories.`}
        </div>
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="numToAdd" className="text-sm text-gray-900 dark:text-gray-100">{t.howManyToAdd || "How many to add:"}</label>
          <input
            id="numToAdd"
            type="number"
            min={1}
            max={matchCount}
            value={numToAdd === "" ? "" : numToAdd}
            onChange={e => {
              const val = e.target.value;
              if (val === "") {
                setNumToAdd("");
              } else {
                setNumToAdd(Math.max(1, Math.min(matchCount, Number(val))));
              }
            }}
            onBlur={e => {
              let val = e.target.value;
              if (val === "" || isNaN(Number(val))) {
                setNumToAdd(1);
              } else {
                setNumToAdd(Math.max(1, Math.min(matchCount, Number(val))));
              }
            }}
            className="w-16 border rounded px-2 py-1 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            disabled={matchCount === 0}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onAdd} disabled={matchCount === 0}>{t.addSelected || "Add selected"}</Button>
          <Button variant="outline" onClick={onClose}>{t.closeStr || "Close"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
