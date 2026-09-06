import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKENS_KEY = '@auth_tokens';
const ROLE_KEY = '@user_role';
const USER_DATA_KEY = '@user_data';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export const Storage = {
  async saveTokens(tokens: Tokens): Promise<void> {
    await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  },
  async getTokens(): Promise<Tokens | null> {
    const data = await AsyncStorage.getItem(TOKENS_KEY);
    return data ? JSON.parse(data) : null;
  },
  async removeTokens(): Promise<void> {
    await AsyncStorage.removeItem(TOKENS_KEY);
  },

  async saveRole(role: 'passenger' | 'driver'): Promise<void> {
    await AsyncStorage.setItem(ROLE_KEY, role);
  },
  async getRole(): Promise<'passenger' | 'driver' | null> {
    const role = await AsyncStorage.getItem(ROLE_KEY);
    return (role as 'passenger' | 'driver') || null;
  },
  async removeRole(): Promise<void> {
    await AsyncStorage.removeItem(ROLE_KEY);
  },

  async saveUserData(user: any): Promise<void> {
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
  },
  async getUserData(): Promise<any | null> {
    const data = await AsyncStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  },
  async removeUserData(): Promise<void> {
    await AsyncStorage.removeItem(USER_DATA_KEY);
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([TOKENS_KEY, ROLE_KEY, USER_DATA_KEY]);
  },
};
