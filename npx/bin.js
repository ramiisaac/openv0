const { exec } = require('child_process');
const path = require('path');
const inquirer = require('inquirer');
const ora = require('ora');
const fs = require('fs-extra');
const { promisify } = require('util');
const Seven = require('node-7z');
const seven = new Seven();

const execAsync = promisify(exec);

const GIT_REPO = `https://github.com/raidendotai/openv0.git`;
const PROJECT_PATH = path.join( process.cwd() , `openv0` );
const GIT_CLONE_CMD = `git clone -b dev --depth 1 ${GIT_REPO} "${PROJECT_PATH}"`

let ENV = {
	OPENAI_MODEL : 'gpt-4',
	PASS__CONTEXT__COMPONENTS_LIBRARY_EXAMPLES__TOKEN_LIMIT: 600,
	OPENV0__COLLECT_UIRAY: 1,
	OPENV0__API: "https://api.openv0.com",
	API__GENERATE_ATTEMPTS: 1, // not implemented yet
	WEBAPP_ROOT: "../webapp",
}

const FRAMEWORK_COMPONENTS_MAP = {
  react: ['nextui','flowbite','shadcn'],
  svelte: ['flowbite','shadcn'],
  next: ['nextui','flowbite','shadcn'],
};
const FRAMEWORK_ICONS_MAP = {
  react: ['lucide'],
  svelte: ['lucide'],
  next: ['lucide'],
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
		if (args[0] === `flush`) {
			const spinnerDb = ora(`flushing openv0 db`).start();
			const { stdoutDb, stderrDb } = await execAsync(`cd openv0 && cd server && node db flush`);
			// await sleep(1000);
			console.log(stdoutDb.trim());
			console.error(stderrDb.trim());
			spinnerDb.succeed('done');

		} else if (args[0].startsWith(`@`) && args[0].includes(`/`)) {
			// download component - update later when expanding to views
			const spinnerDownload = ora(`download openv0 component : ${args[0]}`).start();
			const { stdoutDownload, stderrDownload } = await execAsync(`cd openv0 && cd server && node db download:component:${args[0]}`);
			// await sleep(1000);
			spinnerDownload.succeed('done');
			console.log(stdoutDownload.trim());
			console.error(stderrDownload.trim());
		}

  } else {
    const query = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'What framework to use?',
        choices: [
			{value: 'react', name: 'React'},
			{value: 'svelte', name: 'Svelte'},
			{value: 'next', name: 'Next (currently API only - no web dashboard)'},
		],
      },
      {
        type: 'list',
        name: 'components',
        message: 'What components library to use?',
        choices: (query) => FRAMEWORK_COMPONENTS_MAP[query.framework],
      },
      {
        type: 'list',
        name: 'icons',
        message: 'What icons library to use?',
        choices: (query) => FRAMEWORK_ICONS_MAP[query.framework],
      },
      {
        type: 'input',
        name: 'OPENAI_API_KEY',
        message: 'Paste your OpenAI API key (you can also edit it in .env later) : ',
		type: 'password',
		mask: '*',
      },
      {
        type: 'confirm',
        name: 'OPENV0__COLLECT_UIRAY',
        message: 'We are working on an open source vision model called ui-ray, '
					+ 'to make generative UI multimodal\n'
					+ '  Enable ui-ray debug logs to contribute ? (recommended) ',
      },
    ]);

		if (!process.env.OPENAI_API_KEY) {
			ENV.OPENAI_API_KEY = query.OPENAI_API_KEY.length ? query.OPENAI_API_KEY : "YOUR_OPENAI_KEY"
		}
		ENV.OPENV0__COLLECT_UIRAY = query.OPENV0__COLLECT_UIRAY ? 1 : 0

		// make dir
		try {
			fs.mkdirSync(`openv0`);
		} catch (err) {
			//if (err.code === 'EEXIST') console.log(`openv0 already exists in current directory.`);
			//else	console.log(error);
			//process.exit(1);
			true
		}



		// clone repo
		const spinnerGit = ora(`cloning ${GIT_REPO} in ${PROJECT_PATH}`).start();
		const { stdoutGit, stderrGit } = await execAsync(GIT_CLONE_CMD);
		spinnerGit.succeed('cloned repo');


		// duplicate target webapp-starters/{} to /webapp
		fs.mkdirSync( path.join( process.cwd() , `openv0/webapp` ) , { recursive: true });
		const sourceDir = path.join(process.cwd(), `openv0/webapps-starters/${query.framework}/${query.components}`);
		const destinationDir = path.join(process.cwd(), `openv0/webapp`);
		const spinnerWebappDir = ora(`creating openv0/webbapp from : openv0/webapps-starters/${query.framework}/${query.components}`).start();
		await fs.copy(sourceDir, destinationDir)
		spinnerWebappDir.succeed('created openv0/webbapp');

		// rm -rf clean
		const spinnerRm = ora(`cleaning files`).start();
		try{await fs.rm(path.join(PROJECT_PATH, ".git"), { recursive: true, force: true })}catch(e){false}
		try{await fs.rm(path.join(PROJECT_PATH, "bin"), { recursive: true, force: true })}catch(e){false}
		try{await fs.rm(path.join(process.cwd() , "openv0/webapps-starters"), { recursive: true, force: true })}catch(e){false}
		spinnerRm.succeed();

		// .env in server (try/catch)
		const spinnerServerEnv = ora(`creating openv0/server/.env`).start();
		await fs.writeFile(
			path.join( process.cwd() , `openv0/server/.env` ),
			Object.entries(ENV).map(([key, value]) => {
				return typeof value === 'string'
								? `${key}="${value}"`
								: `${key}=${value}`
			}).join('\n')
		)
		spinnerEnv.succeed();

		const spinner7z = ora(`extracting openv0/server/library/icons/lucide/vectordb/index.7z to index.json`).start();
		await seven.extractFull(
			path.join(process.cwd(), `openv0/server/library/icons/lucide/vectordb/index.7z`),
			path.join(process.cwd(), `openv0/server/library/icons/lucide/vectordb`),
		)
		await fs.rm(path.join(process.cwd() , "openv0/server/library/icons/lucide/vectordb/index.7z"))
		spinner7z.succeed();

		process.chdir(PROJECT_PATH);
		// install server packages
		const spinnerServerNpmInstall = ora(`installing packages in openv0/server`).start();
		const { stdoutServer, stderrServer } = await execAsync(`cd server && npm i`);
		console.log(stdoutServer.trim());
		console.error(stderrServer.trim());
		spinnerServerNpmInstall.succeed('done');

		// install webapp packages
		const spinnerWebappNpmInstall = ora(`installing packages in openv0/webapp`).start();
		const { stdoutWebapp, stderrWebapp } = await execAsync(`cd webapp && npm i`);
		console.log(stdoutWebapp.trim());
		console.error(stderrWebapp.trim());
		spinnerWebappNpmInstall.succeed('done');

		console.log(`how to use ----------------------------------`);
		console.log(`\t0. cd openv0`);
		console.log(`\t2. start server    : cd server && node api.js`);
		console.log(`\t3. start webapp    : cd webapp && npm run dev`);
		console.log(`\t4. start browser   : http://localhost:5173/`);

  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Error:', error);
});
