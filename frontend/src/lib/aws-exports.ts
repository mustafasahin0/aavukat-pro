const awsConfig = {
  Auth: {
    Cognito: {
      // Cognito User Pool config
      region: process.env.NEXT_PUBLIC_COGNITO_REGION!,
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID!,
      authenticationFlowType: 'USER_SRP_AUTH',

      // Hosted UI OAuth config
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN!,
          redirectSignIn: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_IN!,
          redirectSignOut: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_SIGN_OUT!,
          responseType: 'code',
          scopes: ['openid', 'email', 'profile'],
        },
      },
    },
  },
};

export default awsConfig; 