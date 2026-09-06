import ReactDOM from 'react-dom/client';
import App from './App';
import DesktopPetOverlay from './desktop-pet/DesktopPetOverlay';
import './index.css';

const isDesktopPet = new URLSearchParams(window.location.search).get('surface') === 'desktop-pet';
if (isDesktopPet) document.documentElement.classList.add('desktop-pet-surface');

ReactDOM.createRoot(document.getElementById('root')!).render(
  isDesktopPet ? <DesktopPetOverlay /> : <App />
);
