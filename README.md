# Końska Polana

Przeglądarkowy prototyp spokojnej gry jeździeckiej dla dzieci. Three.js, JavaScript i Vite. Modele powstają w kodzie, dźwięki są syntezowane lokalnie. Gra nie potrzebuje konta ani zewnętrznych usług.

## Uruchomienie

Wymagany Node.js 22.12+ lub 24+.

```sh
npm install
npm run dev
```

Otwórz adres wypisany przez Vite (zwykle http://127.0.0.1:5173). `npm run build` tworzy statyczną wersję w `dist`, którą można umieścić na hostingu. `npm test` sprawdza mechanikę ruchu, skoków i kolizji.

Przy uruchomionym serwerze na porcie 5173: `node scripts/browser-check.mjs` wykonuje test w zainstalowanym Chrome i zapisuje zrzuty w `artifacts/`.
`node scripts/appearance-check.mjs` sprawdza zmiany wszystkich wariantów w podglądzie, zapis wyborów i układ panelu. Testy używają osobnego profilu i nie zmieniają zapisów gracza.

## Sterowanie

- W/S lub góra/dół: zmiana tempa (postój, stęp, kłus, galop), bez trzymania klawisza.
- A/D lub lewo/prawo: skręcanie, również na postoju.
- Spacja: skok z szerokim marginesem czasowym.
- C: kamera TPP/FPP. Przeciągnięcie myszą: rozglądanie.
- Escape: pauza. Zmiana karty lub utrata fokusu również pauzuje grę.
- Przyciski obrazkowe: dźwięk, pomoc, wygląd konia, powrót do stajni, pełny ekran.

Dźwięk rusza po pierwszym kliknięciu lub naciśnięciu klawisza, zgodnie z zasadami przeglądarek. Wygląd konia zapisuje się w localStorage; gdy pamięć jest niedostępna, zmiany działają przez czas sesji.

## Zakres prototypu

Stadnina, łąka, leśna pętla, trzy niskie przeszkody, animowany koń i jeździec, dwie kamery, mapa, kolizje, pauza, syntetyczny tętent i odgłosy przyrody bez muzyki. Można przeskakiwać zarówno przeszkody, jak i ogrodzenie wybiegu.

Panel wyglądu ma cztery sekcje: kolory, fryzury, ozdoby i czaprak. Grzywa i ogon mają niezależny wybór krótkiej, długiej lub zaplecionej fryzury. Dostępne ozdoby to kwiaty, kokarda i wstążki (także na ogonie), pięć kolorów i opcja bez ozdoby. Czaprak może być gładki, w kropki, paski lub gwiazdki. Wszystko jest odblokowane; wybór zapisuje się lokalnie. Zapisy ze starszej wersji zachowują kolory i kwiatek.

To prototyp na PC z klawiaturą, nie gotowa gra mobilna. Dźwięki i modele są robocze. Do oceny z dzieckiem: tempo skręcania, wysokość kamery, czytelność konia, łatwość skoków i płynność na docelowym komputerze.

Model konia jest w `src/horse.js`: zaokrąglona sylwetka, pysk, pasma grzywy i ogona, nogi z ruchomymi stawami oraz dopasowany czaprak i siodło. Podgląd w panelu wyglądu pozwala obracać i przybliżać konia, opcjonalnie z jeźdźcem. Zmiany kolorów są widoczne od razu. Przeciąganie obraca model, kółko myszy przybliża; dostępne są też przyciski i strzałki klawiatury po ustawieniu fokusu na podglądzie.
