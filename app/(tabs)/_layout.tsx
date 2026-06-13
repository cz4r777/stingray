import { Tabs } from 'expo-router';
import { StingrayAction } from '@/lib/stingray-action';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#23c483', tabBarStyle: { backgroundColor: '#0b0b0d' }, headerStyle: { backgroundColor: '#0b0b0d' }, headerTintColor: 'white', headerRight: () => <StingrayAction /> }}>
      <Tabs.Screen name="conversations" options={{ title: 'Chats' }} />
      <Tabs.Screen name="contacts" options={{ title: 'Contacts' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
