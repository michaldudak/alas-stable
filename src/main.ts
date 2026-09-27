import '@fontsource-variable/inter';
import './style.css';
import horseUrl from './assets/horse.glb?url';
import riderUrl from './assets/rider.glb?url';
import { loadHorseAsset, loadRiderAsset, startGame } from './app/game.ts';

// Horses and the rider are built from sculpted assets, so load them first.
const game = Promise.all([
	loadHorseAsset(horseUrl),
	loadRiderAsset(riderUrl),
]).then(() => startGame());
if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(() => {
		void game.then((running) => running.dispose());
	});
}
