"use client";

import Select, { components, type SingleValueProps } from "react-select";
import ReactCountryFlag from "react-country-flag";

import i18n, { languageOptions } from "./i18n";

type LanguageOption = (typeof languageOptions)[number];

function SingleValue(props: SingleValueProps<LanguageOption, false>) {
  return (
    <components.SingleValue {...props}>
      <span className="inline-flex items-center gap-2">
        <ReactCountryFlag
          countryCode={props.data.flag}
          svg
          style={{ width: "1.1em", height: "1.1em" }}
        />
        <span>{props.data.label}</span>
      </span>
    </components.SingleValue>
  );
}

export function LanguageSwitcher() {
  const currentLanguage =
    languageOptions.find((item) => item.value === i18n.resolvedLanguage) ?? languageOptions[0];

  return (
    <div className="w-full md:w-32 md:justify-self-end">
      <Select<LanguageOption, false>
        instanceId="language-switcher"
        classNamePrefix="radar-select"
        options={[...languageOptions]}
        value={currentLanguage}
        isSearchable={false}
        components={{ SingleValue }}
        onChange={(option) => {
          if (option) {
            i18n.changeLanguage(option.value);
          }
        }}
        styles={{
          control: (base) => ({
            ...base,
            minHeight: 42,
            borderRadius: 16,
            borderColor: "var(--color-line)",
            boxShadow: "none",
            backgroundColor: "rgba(255,250,241,0.88)",
          }),
          option: (base, state) => ({
            ...base,
            display: "flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: state.isFocused ? "rgba(243,233,217,0.95)" : "#fffaf1",
            color: "var(--color-ink)",
          }),
          menu: (base) => ({
            ...base,
            borderRadius: 18,
            overflow: "hidden",
          }),
        }}
        formatOptionLabel={(option) => (
          <span className="inline-flex items-center gap-2">
            <ReactCountryFlag
              countryCode={option.flag}
              svg
              style={{ width: "1.1em", height: "1.1em" }}
            />
            <span>{option.label}</span>
          </span>
        )}
      />
    </div>
  );
}
