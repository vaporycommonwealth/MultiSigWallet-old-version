npm rebuild leveldown scrypt;
./node_modules/ethereumjs-testrpc/bin/testrpc --port 8545 --account "0xb21e287e6dcb34cf16abb6ce71f7209906c13f763c6415c6b2320eea7688212f, 10000000000000000000000000" --account "0x3ba8150286625233d3154d795527e3cbbc07a135d14392e9485f08d2d555fb3d, 10000000000000000000000000" &
sleep 5;
karma start config.karma.js
./node_modules/.bin/electron-rebuild;
