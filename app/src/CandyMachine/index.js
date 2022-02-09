import React from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, Provider, web3 } from '@project-serum/anchor';
import { MintLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { sendTransactions } from './connection';
import './CandyMachine.css';
import {
  candyMachineProgram,
  TOKEN_METADATA_PROGRAM_ID,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  getAtaForMint,
  getNetworkExpire,
  getNetworkToken,
  CIVIC,
} from './helpers';

const { SystemProgram } = web3;
const opts = {
  preflightCommitment: 'processed',
};

const CandyMachine = () => {
  const [candyMachine, setCandyMachine] = React.useState(null);
  const [walletAddress, setWalletAddress] = React.useState(null);
  const [provider, setProvider] = React.useState(null);

  React.useEffect(() => {
    window.addEventListener('load', connectWallet);

    return () => {
      window.removeEventListener('load', connectWallet);
    };
  }, []);

  React.useEffect(() => {
    getProvider();
  }, [walletAddress]);

  React.useEffect(() => {
    if (provider) {
      getCandyMachineState();
    }
  }, [provider]);

  async function connectWallet() {
    if (window.solana && window.solana.isPhantom) {
      const res = await window.solana.connect();

      setWalletAddress({ publicKey: res.publicKey });
    }
  }

  const getProvider = () => {
    const rpcHost = process.env.REACT_APP_SOLANA_RPC_HOST;

    // * Create a new connection to the RPC solana server
    const connection = new Connection(rpcHost);

    // * Create a new provider (provider basically provides us the ability to interact with solana blockchain)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new Provider(connection, window.solana, {
      // ! I don't know what this does
      preflightCommitment: 'processed',
    });

    setProvider(provider);
  };

  const getCandyMachineCreator = async candyMachine => {
    const candyMachineID = new PublicKey(candyMachine);
    return await web3.PublicKey.findProgramAddress(
      [Buffer.from('candy_machine'), candyMachineID.toBuffer()],
      candyMachineProgram,
    );
  };

  const getMetadata = async mint => {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID,
      )
    )[0];
  };

  const getMasterEdition = async mint => {
    return (
      await PublicKey.findProgramAddress(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
          Buffer.from('edition'),
        ],
        TOKEN_METADATA_PROGRAM_ID,
      )
    )[0];
  };

  const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress,
    payer,
    walletAddress,
    splTokenMintAddress,
  ) => {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
      { pubkey: walletAddress, isSigner: false, isWritable: false },
      { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ];
    return new web3.TransactionInstruction({
      keys,
      programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      data: Buffer.from([]),
    });
  };

  async function getCandyMachineState() {
    try {
      // * fetch the idl of common candy machine program (candyMachineProgram is a contract address of common candy machine program like erc20 contract and idl is the abi of the smart contract)
      // ? candyMachineProgram with address (cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ) is a program account or in other words is a smart contract which means it's executable and in solana executable accounts cannot store state so a separate PDA (program driven account) is created which holds out NFT state
      const idl = await Program.fetchIdl(candyMachineProgram, provider);

      if (idl) {
        // * create new program instance with idl/abi and candyMachineProgram (contract address)
        const program = new Program(idl, candyMachineProgram, provider);

        console.log('candyMachineProgram', program);

        // * fetches our candy machine account which holds our NFT state
        const candyMachine = await program.account.candyMachine.fetch(
          process.env.REACT_APP_CANDY_MACHINE_ID,
        );

        const itemsAvailable = candyMachine.data.itemsAvailable.toNumber();
        const itemsRedeemed = candyMachine.itemsRedeemed.toNumber();
        const itemsRemaining = itemsAvailable - itemsRedeemed;
        const goLiveData = candyMachine.data.goLiveDate.toNumber();
        const presale =
          candyMachine.data.whitelistMintSettings?.presale &&
          (!candyMachine.data.goLiveDate ||
            candyMachine.data.goLiveDate.toNumber() >
              new Date().getTime() / 1000);

        // We will be using this later in our UI so let's generate this now
        const goLiveDateTimeString = `${new Date(
          goLiveData * 1000,
        ).toUTCString()}`;

        setCandyMachine({
          id: process.env.REACT_APP_CANDY_MACHINE_ID,
          program,
          state: {
            itemsAvailable,
            itemsRedeemed,
            itemsRemaining,
            goLiveData,
            goLiveDateTimeString,
            isSoldOut: itemsRemaining === 0,
            isActive:
              (presale ||
                candyMachine.data.goLiveDate.toNumber() <
                  new Date().getTime() / 1000) &&
              (candyMachine.endSettings
                ? candyMachine.endSettings.endSettingType.date
                  ? candyMachine.endSettings.number.toNumber() >
                    new Date().getTime() / 1000
                  : itemsRedeemed < candyMachine.endSettings.number.toNumber()
                : true),
            isPresale: presale,
            goLiveDate: candyMachine.data.goLiveDate,
            treasury: candyMachine.wallet,
            tokenMint: candyMachine.tokenMint,
            gatekeeper: candyMachine.data.gatekeeper,
            endSettings: candyMachine.data.endSettings,
            whitelistMintSettings: candyMachine.data.whitelistMintSettings,
            hiddenSettings: candyMachine.data.hiddenSettings,
            price: candyMachine.data.price,
          },
        });

        console.log({
          itemsAvailable,
          itemsRedeemed,
          itemsRemaining,
          goLiveData,
          goLiveDateTimeString,
          presale,
        });
      }
    } catch (error) {
      console.error('error =', error);
    }
  }

  const mintToken = async () => {
    console.log('candy machine -', candyMachine);
    try {
      const mint = web3.Keypair.generate();

      const userTokenAccountAddress = (
        await getAtaForMint(mint.publicKey, walletAddress.publicKey)
      )[0];

      console.log('userTokenAccountAddress -', userTokenAccountAddress);

      const userPayingAccountAddress = candyMachine.tokenMint
        ? (
            await getAtaForMint(candyMachine.tokenMint, walletAddress.publicKey)
          )[0]
        : walletAddress.publicKey;

      console.log('userPayingAccountAddress -', userPayingAccountAddress);

      const candyMachineAddress = candyMachine.id;
      const remainingAccounts = [];
      const signers = [mint];
      const cleanupInstructions = [];
      const instructions = [
        web3.SystemProgram.createAccount({
          fromPubkey: walletAddress.publicKey,
          newAccountPubkey: mint.publicKey,
          space: MintLayout.span,
          lamports:
            await candyMachine.program.provider.connection.getMinimumBalanceForRentExemption(
              MintLayout.span,
            ),
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mint.publicKey,
          0,
          walletAddress.publicKey,
          walletAddress.publicKey,
        ),
        createAssociatedTokenAccountInstruction(
          userTokenAccountAddress,
          walletAddress.publicKey,
          walletAddress.publicKey,
          mint.publicKey,
        ),
        Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          mint.publicKey,
          userTokenAccountAddress,
          walletAddress.publicKey,
          [],
          1,
        ),
      ];

      console.log('instructions -', instructions);

      if (candyMachine.gatekeeper) {
        remainingAccounts.push({
          pubkey: (
            await getNetworkToken(
              walletAddress.publicKey,
              candyMachine.gatekeeper.gatekeeperNetwork,
            )
          )[0],
          isWritable: true,
          isSigner: false,
        });
        console.log('candyMachine.gatekeeper -', remainingAccounts);

        if (candyMachine.gatekeeper.expireOnUse) {
          remainingAccounts.push({
            pubkey: CIVIC,
            isWritable: false,
            isSigner: false,
          });
          remainingAccounts.push({
            pubkey: (
              await getNetworkExpire(candyMachine.gatekeeper.gatekeeperNetwork)
            )[0],
            isWritable: false,
            isSigner: false,
          });

          console.log(
            'candyMachine.gatekeeper.expireOnUse -',
            remainingAccounts,
          );
        }
      }
      if (candyMachine.whitelistMintSettings) {
        const mint = new web3.PublicKey(
          candyMachine.whitelistMintSettings.mint,
        );

        const whitelistToken = (
          await getAtaForMint(mint, walletAddress.publicKey)
        )[0];
        remainingAccounts.push({
          pubkey: whitelistToken,
          isWritable: true,
          isSigner: false,
        });

        console.log('candyMachine.whitelistMintSettings -', remainingAccounts);

        if (candyMachine.whitelistMintSettings.mode.burnEveryTime) {
          const whitelistBurnAuthority = web3.Keypair.generate();

          remainingAccounts.push({
            pubkey: mint,
            isWritable: true,
            isSigner: false,
          });
          remainingAccounts.push({
            pubkey: whitelistBurnAuthority.publicKey,
            isWritable: false,
            isSigner: true,
          });
          signers.push(whitelistBurnAuthority);
          const exists =
            await candyMachine.program.provider.connection.getAccountInfo(
              whitelistToken,
            );
          if (exists) {
            instructions.push(
              Token.createApproveInstruction(
                TOKEN_PROGRAM_ID,
                whitelistToken,
                whitelistBurnAuthority.publicKey,
                walletAddress.publicKey,
                [],
                1,
              ),
            );
            cleanupInstructions.push(
              Token.createRevokeInstruction(
                TOKEN_PROGRAM_ID,
                whitelistToken,
                walletAddress.publicKey,
                [],
              ),
            );
          }

          console.log(
            'candyMachine.whitelistMintSettings.mode.burnEveryTime -',
            remainingAccounts,
          );
        }
      }
      if (candyMachine.tokenMint) {
        const transferAuthority = web3.Keypair.generate();

        signers.push(transferAuthority);
        remainingAccounts.push({
          pubkey: userPayingAccountAddress,
          isWritable: true,
          isSigner: false,
        });
        remainingAccounts.push({
          pubkey: transferAuthority.publicKey,
          isWritable: false,
          isSigner: true,
        });

        instructions.push(
          Token.createApproveInstruction(
            TOKEN_PROGRAM_ID,
            userPayingAccountAddress,
            transferAuthority.publicKey,
            walletAddress.publicKey,
            [],
            candyMachine.price.toNumber(),
          ),
        );
        cleanupInstructions.push(
          Token.createRevokeInstruction(
            TOKEN_PROGRAM_ID,
            userPayingAccountAddress,
            walletAddress.publicKey,
            [],
          ),
        );

        console.log(
          'candyMachine.whitelistMintSettings -',
          remainingAccounts,
          instructions,
          cleanupInstructions,
        );
      }

      const metadataAddress = await getMetadata(mint.publicKey);
      const masterEdition = await getMasterEdition(mint.publicKey);

      console.log(
        'metadataAddress, masterEdition -',
        remainingAccounts,
        masterEdition,
      );

      const [candyMachineCreator, creatorBump] = await getCandyMachineCreator(
        candyMachineAddress,
      );

      console.log(
        'candyMachineCreator, creatorBump -',
        candyMachineCreator,
        creatorBump,
      );

      console.log('accs -', {
        candyMachine: candyMachineAddress,
        candyMachineCreator,
        payer: walletAddress.publicKey,
        wallet: candyMachine.state.treasury,
        mint: mint.publicKey,
        metadata: metadataAddress,
        masterEdition,
        mintAuthority: walletAddress.publicKey,
        updateAuthority: walletAddress.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        recentBlockhashes: web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        instructionSysvarAccount: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      });

      instructions.push(
        await candyMachine.program.instruction.mintNft(creatorBump, {
          accounts: {
            candyMachine: candyMachineAddress,
            candyMachineCreator,
            payer: walletAddress.publicKey,
            wallet: candyMachine.state.treasury,
            mint: mint.publicKey,
            metadata: metadataAddress,
            masterEdition,
            mintAuthority: walletAddress.publicKey,
            updateAuthority: walletAddress.publicKey,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: web3.SYSVAR_RENT_PUBKEY,
            clock: web3.SYSVAR_CLOCK_PUBKEY,
            recentBlockhashes: web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
            instructionSysvarAccount: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          },
          remainingAccounts:
            remainingAccounts.length > 0 ? remainingAccounts : undefined,
        }),
      );

      try {
        console.log('final instructions', instructions);

        return (
          await sendTransactions(
            candyMachine.program.provider.connection,
            candyMachine.program.provider.wallet,
            [instructions, cleanupInstructions],
            [signers, []],
          )
        ).txs.map(t => t.txid);
      } catch (e) {
        console.log('sending tx error -', e);
      }
      return [];
    } catch (error) {
      console.log('general error -', error);
    }
  };

  return (
    candyMachine && (
      <div className="machine-container">
        <p>{`Drop Date: ${candyMachine.state.goLiveDateTimeString}`}</p>
        <p>{`Items Minted: ${candyMachine.state.itemsRedeemed} / ${candyMachine.state.itemsAvailable}`}</p>
        <button className="cta-button mint-button" onClick={mintToken}>
          Mint NFT
        </button>
      </div>
    )
  );
};

export default CandyMachine;
