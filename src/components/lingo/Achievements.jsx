import React from "react";
import { badgeText } from "../../lib/progress";

const ON = { lake: "--on-lake", lingon: "--on-lingon", pine: "--on-pine", cloudberry: "--on-cloudberry" };

// Badge grid. `items` come from achievementList() in src/lib/progress.js.
export default function Achievements({ items, newIds = [], soFarLabel = "{n} so far", lang = "en" }) {
  return (
    <div className="lg-badges">
      {items.map((a) => {
        const { name, desc } = badgeText(a, lang);
        const cls = ["lg-badge"];
        if (!a.unlocked) cls.push("lg-badge--locked");
        if (newIds.includes(a.id)) cls.push("lg-badge--new");
        return (
          <div key={a.id} className={cls.join(" ")}>
            <span
              className="lg-badge__medal"
              style={{ "--c": `var(--${a.color})`, "--on": `var(${ON[a.color]})` }}
              aria-hidden="true"
            >
              {a.medal}
            </span>
            <p className="lg-badge__name">{name}</p>
            <p className="lg-badge__desc">
              {desc}
              {!a.unlocked && a.target > 1 && a.progress > 0 ? ` ${soFarLabel.replace("{n}", a.progress)}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
