import ReactDOM from 'react-dom/client';
import ButlerWorkspace from './ButlerWorkspace';
import DesktopPetOverlay from './desktop-pet/DesktopPetOverlay';
import './index.css';

const surface = new URLSearchParams(window.location.search).get('surface');
if (surface === 'desktop-pet') document.documentElement.classList.add('desktop-pet-surface');
if (surface === 'butler') document.documentElement.classList.add('butler-surface');

const root = document.getElementById('root')!;
ReactDOM.createRoot(root).render(
  surface === 'desktop-pet' ? <DesktopPetOverlay />
    : <ButlerWorkspace />
);
