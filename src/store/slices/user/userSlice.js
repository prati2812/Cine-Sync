import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    clearUser: (state) => {
      state.user = null;
    },
    updateStatus: (state, action) => {
      if (state.user) {
        state.user.status = action.payload;
      }
    },
  },
});

export const { setUser, clearUser, updateStatus } = userSlice.actions;
export default userSlice.reducer;
