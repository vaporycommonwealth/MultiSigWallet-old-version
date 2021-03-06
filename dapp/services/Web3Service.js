(
  function () {
    angular
    .module('multiSigWeb')
    .service("Web3Service", function ($window, $q, Utils, $uibModal, Connection, Config, $http) {

      factory = {};

      factory.webInitialized = $q(function (resolve, reject) {
        window.addEventListener('load', function () {
          // Ledger wallet
          factory.reloadWeb3Provider(resolve, reject);
        });
      });

      /**
      * Reloads web3 provider
      * @param resolve, function (optional)
      * @param reject, function (optional)
      **/
      factory.reloadWeb3Provider = function (resolve, reject) {

        factory.accounts = [];
        factory.coinbase = null;

        // Ledger wallet
        if (txDefault.wallet == "ledger") {
          if (isElectron) {
            factory.ledgerElectronSetup();
            if (resolve) {
              resolve();
            }
          }
          else {
            factory.ledgerSetup();
            if (resolve) {
              resolve();
            }
          }
        }
        // injected web3 provider (Metamask, mist, etc)
        else if (txDefault.wallet == "injected" && $window && $window.web3 && !isElectron) {
          factory.web3 = new Web3($window.web3.currentProvider);
          if (resolve) {
            resolve();
          }
        }
        else if (txDefault.wallet == 'lightwallet' && isElectron) {
          factory.lightWalletSetup();
          if (resolve) {
            resolve();
          }
        }
        else {
          // Connect to Ethereum Node
          factory.web3 = new Web3(new Web3.providers.HttpProvider(txDefault.ethereumNode));
          // Check connection
          factory.web3.net.getListening(function(e){
            if (e) {
              Utils.dangerAlert("You are not connected to any node.");
              if (reject) {
                reject();
              }
            }
            else {
              if (resolve) {
                resolve();
              }
            }
          });
        }
      };

      factory.sendTransaction = function (method, params, options, cb) {
        // Simulate first
        function sendIfSuccess(e, result) {
          if (e) {
            cb(e);
          }
          else {
            if (result) {
              method.sendTransaction.apply(method.sendTransaction, params.concat(cb));
            }
            else {
              cb("Simulated transaction failed");
            }
          }
        }

        if ( options && options.onlySimulate) {
          var args = params.concat(cb);
          method.call.apply(method.call, args);
        }
        else {
          var args = params.concat(sendIfSuccess);
          method.call.apply(method.call, args);
        }
      };

      /**
      * Get ethereum accounts and update account list.
      */
      factory.updateAccounts = function (cb) {
        return factory.web3.eth.getAccounts(
          function (e, accounts) {
            if (e) {
              cb(e);
            }
            else {
              factory.accounts = accounts;

              if (factory.coinbase && accounts && accounts.length && accounts.indexOf(factory.coinbase) != -1) {
                // same coinbase
              }
              else if (accounts) {
                  factory.coinbase = accounts[0];
              }
              else {
                factory.coinbase = null;
              }

              cb(null, accounts);
            }
          }
        );
      };

      /* Ledger setup on browser*/
      factory.ledgerSetup = function () {
        ledgerwallet(
          {
            rpcUrl: txDefault.ethereumNode,
            onSubmit: function () {
              Utils.showSpinner();
            },
            onSigned: function () {
              Utils.stopSpinner();
            },
            getChainID: function (cb) {
             if (!Connection.isConnected) {
               if (txDefault.defaultChainID) {
                 cb(null, txDefault.defaultChainID);
               }
               else {
                 cb("You must set an offline Chain ID in order to sign offline transactions");
               }
             }
             else {
               if (factory.web3) {
                 factory.web3.version.getNetwork(cb);
               }
               else {
                 cb("No valid web3 object");
               }
             }
           }
          }
        ).then(
          function(ledgerWeb3){
            factory.web3 = ledgerWeb3;

            if (resolve) {
              resolve();
            }
            // Open Info Modal
            $uibModal.open({
              templateUrl: 'partials/modals/ledgerHelp.html',
              size: 'md',
              backdrop: 'static',
              windowClass: 'bootstrap-dialog type-info',
              controller: function ($scope, $uibModalInstance, Web3Service) {
                $scope.isElectron = false;
                $scope.ok = function () {
                  $uibModalInstance.close();
                };

                $scope.checkCoinbase = function () {
                  if (Web3Service.coinbase) {
                    $uibModalInstance.close();
                  }
                  else {
                    setTimeout($scope.checkCoinbase, 1000);
                  }

                };

                $scope.checkCoinbase();
              }
            });
          }
        );
      };

      /* Ledger wallet electron setup */
      factory.ledgerElectronSetup = function () {
        factory.engine = new ProviderEngine();
        factory.web3 = new Web3(factory.engine);

        var web3Provider = new HookedWeb3Provider({
          getAccounts: function (cb) {
            $http.get(txDefault.ledgerAPI + "/accounts").success(function (accounts) {
              cb(null, accounts);
            }).error(cb);
          },
          approveTransaction: function(txParams, cb) {
            Utils.showSpinner();
            cb(null, true);
          },
          signTransaction: function(txData, cb) {
            function sendToLedger(chainID) {
              $http.post(txDefault.ledgerAPI + "/sign-transaction", {tx: txData, chain: chainID}).then(function (tx) {
                Utils.stopSpinner();
                cb(null, tx.data.signed);
              }, function(e){
                Utils.stopSpinner(); cb(e);
              });
            }

            if (!Connection.isConnected) {
              if (txDefault.defaultChainID) {
                sendToLedger(txDefault.defaultChainID);
              }
              else {
                Utils.stopSpinner();
                cb("You must set an offline Chain ID in order to sign offline transactions");
              }
            }
            else {
              if (factory.web3) {
                factory.web3.version.getNetwork(function (e, chainID) {
                  if (e) {
                    Utils.stopSpinner();
                    cb(e);
                  }
                  else {
                    sendToLedger(chainID);
                  }
                });
              }
              else {
                Utils.stopSpinner();
                cb("No valid web3 object");
              }
            }
          }
        });

        factory.web3 = new Web3(factory.engine);

        factory.engine.addProvider(web3Provider);

        factory.engine.addProvider(new RpcSubprovider({
          rpcUrl: txDefault.ethereumNode
        }));
        factory.engine.start();

        // Open Info Modal
        $uibModal.open({
          templateUrl: 'partials/modals/ledgerHelp.html',
          size: 'md',
          backdrop: 'static',
          windowClass: 'bootstrap-dialog type-info',
          controller: function ($scope, $uibModalInstance, Web3Service) {
            $scope.isElectron = true;
            $scope.ok = function () {
              $uibModalInstance.close();
            };

            $scope.checkCoinbase = function () {
              if (Web3Service.coinbase) {
                setTimeout($uibModalInstance.close, 1000);
              }
              else {
                setTimeout($scope.checkCoinbase, 1000);
              }

            };

            $scope.checkCoinbase();
          }
        });
      };

      /**
      * Select account
      **/
      factory.selectAccount = function (account) {
        factory.coinbase = account;
      };

      /**
      * Light wallet vars
      */
      factory.keystore = null;
      factory.addresses = [];

      /**
      *
      */
      function _web3Setup () {
        // Set HookedWeb3Provider
        const ethUtil = require('ethereumjs-util');
        const EthTx = require('ethereumjs-tx');
        var web3Provider = null;
        var options = {
          getAccounts: function (cb) {
            cb(null, factory.getLightWalletAddresses());
          },
          approveTransaction: function(txParams, cb){
            cb(null, true);
          },
          signTransaction: function(txData, cb) {
            // Show password modal
            $uibModal.open({
              templateUrl: 'partials/modals/askLightWalletPassword.html',
              size: 'md',
              backdrop: 'static',
              controller: function ($scope, $uibModalInstance) {
                $scope.title = 'Confirm transaction';

                $scope.ok = function () {
                  // Enable spinner
                  $scope.showLoadingSpinner = true;

                  factory.decryptLightWallet(txData.from, $scope.password, function (response, v3Instance) {
                    if (!response) {
                      // Disable spinner
                      $scope.showLoadingSpinner = false;
                      $uibModalInstance.dismiss();
                      cb('Invalid password', null);
                    }
                    else {
                      // Retrieve wallet private key
                      var privateKey = v3Instance.getPrivateKey();
                      txData.value = txData.value || '0x00';
                      txData.data = ethUtil.addHexPrefix(txData.data);
                      txData.gasPrice = parseInt(txData.gasPrice, 16);
                      txData.nonce = parseInt(txData.nonce, 16);
                      txData.gasLimit = txData.gas;

                      // Sign transaction
                      var tx = new EthTx(txData);
                      tx.sign(privateKey);
                      // Disable spinner
                      $scope.showLoadingSpinner = false;
                      cb(null, '0x' + tx.serialize().toString('hex'));
                      $uibModalInstance.close();
                    }
                  });
                };

                $scope.cancel = function () {
                  $uibModalInstance.dismiss();
                  cb(
                    {
                      toString: function () {
                        return 'User denied';
                      }
                    },
                    null
                  );
                };

              }
            });
          }
        };

        web3Provider = new HookedWalletProvider(options);
        //web3Provider.transaction_signer = factory.keystore;
        web3Provider.host = txDefault.ethereumNode;
        // Setup engine
        factory.engine = new ProviderEngine();
        factory.web3 = new Web3(factory.engine);
        // Add providers
        factory.engine.addProvider(web3Provider);
        factory.engine.addProvider(new RpcSubprovider({
          rpcUrl: txDefault.ethereumNode
        }));
        // Start engine
        factory.engine.start();
      }

      /**
      * Light wallet setup
      * @param restore, default false
      * @param password, default null
      */
      factory.lightWalletSetup = function (restore=false, password=null) {
        factory.password_provider_callback = null;
        /*factory.engine = new ProviderEngine();
        factory.web3 = new Web3(factory.engine);*/

        if (factory.getKeystore()) {
          if (restore) {
            factory.restoreLightWallet(password);
          }
          else {
            _web3Setup();
          }
        }
      };

      /**
      * Creates a new keystore and within one account
      */
      factory.createLightWallet = function (password, ctrlCallback) {
        var v3String = null;
        // key => value object (address => V3)
        var keystoreObj = JSON.parse(factory.getKeystore()) || {};
        var seed = factory.generateLightWalletSeed();
        // Create hd keystore
        var keyring = new hdkeyring({
          mnemonic: seed,
          numberOfAccounts: 1,
        });

        v3String = keyring.wallets[0].toV3String(password);

        // Set keystore in V3 format
        factory.keystore = keyring.wallets[0].toV3(password);
        // Encrypt V3
        encryptor.encrypt(password, v3String)
        .then(function (encryptedV3String) {
          var generatedAddress = keyring.wallets[0].getAddressString();

          if (!generatedAddress.startsWith('0x')) {
            generatedAddress =  '0x' + generatedAddress;
          }

          // Add address => encrypted V3 to keystore object
          keystoreObj[generatedAddress] = encryptedV3String;
          // Save the global keystore object
          factory.setKeystore(keystoreObj);
          // Add the new address to the list of available addresses
          factory.addresses.push(generatedAddress);
          // Set the new account as selected
          factory.selectAccount(generatedAddress);
          // Do web3 setup
          factory.lightWalletSetup(false);

          ctrlCallback(generatedAddress);
        });
      };

      factory.importLightWalletAccount = function (v3, password, ctrlCallback) {
        var v3String = JSON.stringify(v3);
        // key => value object (address => V3)
        var keystoreObj = JSON.parse(factory.getKeystore()) || {};
        // Set keystore in V3 format
        factory.keystore = v3;
        // Encrypt V3
        encryptor.encrypt(password, v3String)
        .then(function (encryptedV3String) {
          var generatedAddress = v3.address;

          if (!generatedAddress.startsWith('0x')) {
            generatedAddress =  '0x' + generatedAddress;
          }

          // Add address => encrypted V3 to keystore object
          keystoreObj[generatedAddress] = encryptedV3String;
          // Save the global keystore object
          factory.setKeystore(keystoreObj);
          // Add the new address to the list of available addresses
          factory.addresses.push(generatedAddress);
          // Set the new account as selected
          factory.selectAccount(generatedAddress);
          // Do web3 setup
          factory.lightWalletSetup(false);

          ctrlCallback(generatedAddress);
        });
      };

      /**
      * Decrypts a V3 keystore
      */
      factory.decryptLightWallet = function (address, password, callback) {
        var keystore = JSON.parse(factory.getKeystore());
        var encryptedV3String = keystore[address];
        encryptor.decrypt(password, encryptedV3String)
        .then(function (decryptedV3String) {
          v3Instance = ethereumWallet.fromV3(decryptedV3String, password);
          callback(true, v3Instance);
        })
        .catch(function (error) {
          callback(false);
        });
      };

      /**
      * Restore keystore from localStorage
      * @param password,
      */
      factory.restoreLightWallet = function (password) {
        factory.addresses = [];
        if (factory.getKeystore() && password) {
          try {
            encryptor.decrypt(password, factory.getKeystore())
            .then(function (decryptedV3String) {
              factory.keystore = JSON.parse(decryptedV3String); //ethereumWallet.fromV3(decryptedV3String, password);
              factory.addresses = factory.getLightWalletAddresses();
              _web3Setup();
            });
          }
          catch (error) {
            Utils.dangerAlert({message: "Invalid password."});
          }
        }
        else if (factory.getKeystore()) {
          Config.getConfiguration('accounts').map(function (account) {
            factory.addresses.push('0x' + account.address.replace('0x', ''));
          });
        }
      };

      /**
      * Returns keystore string from localStorage or null
      */
      factory.getKeystore = function () {
        return localStorage.getItem('keystore');
      };

      /**
      * Set keystore localStorage string
      */
      factory.setKeystore = function (value) {
        // check wheter valus is a JSON valid format
        var valueToStore;
        try {
          valueToStore = JSON.stringify(value);
          localStorage.setItem('keystore', valueToStore);
        }
        catch (err) {
          throw err;
        }
      };

      /**
      * Checks whether input seed is valid or not
      */
      factory.isSeedValid = function (seed) {
        return lightwallet.keystore.isSeedValid(seed);
      };

      /**
      * Generates a new random seed
      */
      factory.generateLightWalletSeed = function () {
        return lightwallet.keystore.generateRandomSeed();
      };

      /**
      * Return accounts list
      */
      factory.getLightWalletAddresses = function () {
        var addresses = [];
        Config.getConfiguration('accounts').map(function (item) {
          addresses.push(item.address);
        });

        return addresses;        
      };


      /**
      /* Engine setup on startup
      */
      function _startupSetup () {
        factory.engine = new ProviderEngine();
        factory.web3 = new Web3(factory.engine);
        if (factory.getKeystore()) {
          factory.engine.addProvider(new RpcSubprovider({
            rpcUrl: txDefault.ethereumNode
          }));
        }
        factory.engine.start();
      }
      _startupSetup();

      return factory;
    });
  }
)();
