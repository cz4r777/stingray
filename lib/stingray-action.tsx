import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useIdentity } from './identity';

export function StingrayAction() {
  const { strictMode, armStrictMode, hideSensitiveScreen } = useIdentity();

  return (
    <Pressable
      onPress={() => {
        if (strictMode) {
          hideSensitiveScreen();
          return;
        }
        armStrictMode();
        Alert.alert(
          'Strict mode armed',
          'The Faraday gate is now forced on for this session. Sensitive screens stay hidden until you reveal them locally on a safe transport.',
        );
      }}
      style={s.button}
    >
      <Text style={s.text}>STINGRAY</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#23c483',
  },
  text: {
    color: '#23c483',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
