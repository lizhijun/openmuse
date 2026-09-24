import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { zhCN } from "./zh-CN";

export type Language = "zh" | "en";
let currentLanguage: Language = "zh";
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "zh", setLanguage: () => {} });

function savedLanguage(): Language {
  try {
    return globalThis.localStorage?.getItem("openmuse-language") === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(savedLanguage);
  currentLanguage = language;
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title =
      language === "zh" ? "OpenMuse — 给生活多一点空间" : "OpenMuse — a little room for everything";
  }, [language]);
  const setLanguage = (next: Language) => {
    currentLanguage = next;
    updateLanguage(next);
    try {
      globalThis.localStorage?.setItem("openmuse-language", next);
    } catch {
      // Native builds and restricted browsers may not provide localStorage.
    }
  };
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function translate(value: string, language: Language): string {
  if (language === "en") return value;
  const trimmed = value.trim().replace(/\s+/g, " ");
  const translation = zhCN[trimmed];
  if (!translation) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translation}${trailing}`;
}

export function Text({ children, ...props }: TextProps) {
  const { language } = useLanguage();
  const localize = (value: ReactNode): ReactNode =>
    typeof value === "string"
      ? translate(value, language)
      : Array.isArray(value)
        ? value.map(localize)
        : value;
  const localized = localize(children);
  return <NativeText {...props}>{localized}</NativeText>;
}

export function TextInput(props: TextInputProps) {
  const { language } = useLanguage();
  return (
    <NativeTextInput
      {...props}
      placeholder={props.placeholder ? translate(props.placeholder, language) : undefined}
      accessibilityLabel={
        props.accessibilityLabel ? translate(props.accessibilityLabel, language) : undefined
      }
    />
  );
}
