import { LanguageSwitcher } from '@/components/language-switcher';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ProfileScreen() {
  return (
    <PlaceholderScreen titleKey="tabs.profile">
      <LanguageSwitcher />
    </PlaceholderScreen>
  );
}
