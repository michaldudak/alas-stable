import '@fontsource-variable/inter';
import './style.css';
import horseUrl from './assets/horse.glb?url';
import { loadHorseAsset, loadRiderAssets, startGame } from './app/game.ts';

// Horses and riders are built from modelled assets, so load them first.
const game = Promise.all([loadHorseAsset(horseUrl), loadRiderAssets()]).then(
	() => startGame(),
);
if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(() => {
		void game.then((running) => running.dispose());
	});
}
