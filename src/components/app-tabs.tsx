import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { PwaColors } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={PwaColors.surface}
      indicatorColor={PwaColors.primarySoft}
      tintColor={PwaColors.primary}
      labelStyle={{ selected: { color: PwaColors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Tổng quan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.pie.fill" md="pie_chart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="thiet-lap">
        <NativeTabs.Trigger.Label>Thiết lập</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
