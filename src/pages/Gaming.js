import React from 'react';
import './Gaming.css';

function Gaming() {
    return (
        <div className="Home">
            <header className="Home-header">
                <h2>I am also a gamer and I like to play video games!</h2>
                <p>
                Here are the links to my gaming stuff!
                </p>
                <a
                className="no-underline-app-header"
                href="https://www.dotabuff.com/players/395370670"
                target="_blank"
                rel="noopener noreferrer"
                >
                Dotabuff: MeyraMax
                </a>
                <a
                className="no-underline-app-header"
                href="https://steamcommunity.com/id/sasadkasokcasokmpo/"
                target="_blank"
                rel="noopener noreferrer"
                >
                Steam: MeyraMax
                </a>
                <a
                className="no-underline-app-header"
                href="https://discord.com/users/297442450623037441"
                target="_blank"
                rel="noopener noreferrer"
                >
                Discord: meyramax
                </a>
                <a
                className="no-underline-app-header"
                href="https://tracker.gg/valorant/profile/riot/MeyraMax%23xdxd/overview"
                target="_blank"
                rel="noopener noreferrer"
                >
                Valorant: MeyraMax #xDxD
                </a>
                <a
                className="no-underline-app-header"
                href="https://www.twitch.tv/meyramax"
                target="_blank"
                rel="noopener noreferrer"
                >
                Twitch: MeyraMax
                </a>
                <p></p>
                <p>Other stuff:</p>
                <a
                className="no-underline-app-header"
                href="https://myanimelist.net/animelist/MeyraMax"
                target="_blank"
                rel="noopener noreferrer"
                >
                Myanimelist: MeyraMax
                </a>
            </header>
        </div>
    );
}

export default Gaming;
