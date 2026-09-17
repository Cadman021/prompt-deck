// src/components/layout/AppSidebar.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutGrid,
  History,
  Trophy,
  Settings,
  Cloud,
  FlaskConical,
  Terminal,
} from 'lucide-react';

export type SidebarView = 'bench' | 'tests' | 'history' | 'leaderboard' | 'settings';

interface AppSidebarProps {
  activeView: SidebarView;
  onNavigate: (view: SidebarView) => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ activeView, onNavigate }) => {
  const { t } = useTranslation();

  const navItem = (
    id: SidebarView,
    icon: React.ReactNode,
    label: string,
    badge?: string
  ) => {
    const active = activeView === id;
    return (
      <button
        key={id}
        onClick={() => onNavigate(id)}
        title={label}
        className={`relative group flex flex-col items-center gap-1 w-full py-2.5 rounded-xl transition-all ${
          active
            ? 'bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80'
        }`}
      >
        {active && (
          <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-indigo-500" />
        )}
        {icon}
        <span className="text-[10px] font-medium leading-none">{label}</span>
        {badge && (
          <span className="absolute top-1 end-1 text-[8px] font-bold px-1 py-px rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden md:flex flex-col items-center w-[68px] shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 backdrop-blur py-3 px-2 gap-1">
      {/* Logo */}
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm mb-2">
        <Terminal className="w-5 h-5 text-white" />
      </div>

      {navItem('bench', <LayoutGrid className="w-5 h-5" />, t('nav.bench', 'Bench'))}
      {navItem('tests', <FlaskConical className="w-5 h-5" />, t('nav.tests', 'Tests'))}
      {navItem('history', <History className="w-5 h-5" />, t('nav.history', 'History'))}
      {navItem('leaderboard', <Trophy className="w-5 h-5" />, t('nav.leaderboard', 'Board'))}

      <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 my-1" />

      {/* Future placeholders — reserved space for next features */}
      <button
        disabled
        title={t('nav.cloudInputSoon', 'Cloud input — soon')}
        className="relative flex flex-col items-center gap-1 w-full py-2.5 rounded-xl text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-70"
      >
        <Cloud className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-none">{t('nav.cloud', 'Cloud')}</span>
        <span className="absolute top-1 end-1 text-[8px] font-bold px-1 py-px rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
          {t('nav.soon', 'Soon')}
        </span>
      </button>
      <div className="flex-1" />

      {navItem('settings', <Settings className="w-5 h-5" />, t('nav.settings', 'Config'))}
    </aside>
  );
};
