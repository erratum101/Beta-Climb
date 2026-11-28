import { createContext, useContext, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ui, type Ui } from './copy'
import { applyDocumentLang, detectLang, type Lang } from './lang'

const LangContext = createContext<Lang>('en')

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang] = useState(detectLang)

  useLayoutEffect(() => {
    applyDocumentLang(lang)
  }, [lang])

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  return useContext(LangContext)
}

export function useUi(): Ui {
  return ui(useLang())
}
