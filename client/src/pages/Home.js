import axios from 'axios';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  logout,
  setOnlineUser,
  setSocketConnection,
  setUser,
} from '../redux/userSlice';
import Sidebar from '../components/Sidebar';
import io from 'socket.io-client';

const Home = () => {
  const user = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Fetch user details from backend
  const fetchUserDetails = async () => {
    try {
      const URL = `${process.env.REACT_APP_BACKEND_URL}/api/user-details`;
      const response = await axios({
        url: URL,
        withCredentials: true,
      });

      dispatch(setUser(response.data.data));

      if (response.data.data.logout) {
        dispatch(logout());
        navigate('/email');
      }

      console.log('✅ User Details:', response.data.data);
    } catch (error) {
      console.error('❌ Error fetching user details:', error);
    }
  };

  // ✅ On component mount, get user info
  useEffect(() => {
    fetchUserDetails();
  }, []);

  // ✅ Setup socket.io connection
  useEffect(() => {
   

    const socketConnection = io(process.env.REACT_APP_BACKEND_URL, {
      auth: {
        token: localStorage.getItem('token'),
      },
      withCredentials: true,
      transports: ['polling', 'websocket'],  // ✅ Enable fallback
    });
    

    // 🔌 Listen for online users
    socketConnection.on('onlineUser', (data) => {
      console.log('🟢 Online Users:', data);
      dispatch(setOnlineUser(data));
    });

    // ❗Debugging Socket Errors
    socketConnection.on('connect_error', (err) => {
      console.error('❌ Socket Connection Error:', err.message);
    });

    // ✅ Store socket in Redux
    dispatch(setSocketConnection(socketConnection));

    // 🧹 Clean up on unmount
    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const basePath = location.pathname === '/';

  return (
    <div className="grid lg:grid-cols-[300px,1fr] h-screen max-h-screen">
      {/* ✅ Sidebar only on homepage */}
      <section className={`bg-white ${!basePath && 'hidden'} lg:block`}>
        <Sidebar />
      </section>

      {/* ✅ Message window */}
      <section className={`${basePath && 'hidden'}`}>
        <Outlet />
      </section>

      {/* ✅ Empty state on first load */}
      <div
        className={`justify-center items-center flex-col gap-2 hidden ${
          !basePath ? 'hidden' : 'lg:flex'
        }`}
      >
        <p className="text-lg mt-2 text-slate-500">
          Select user to send message
        </p>
      </div>
    </div>
  );
};

export default Home;
