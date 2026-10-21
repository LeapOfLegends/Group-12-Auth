pipeline {
    agent any

    triggers {
        pollSCM('H/5 * * * *')
    }

    environment {
        DOCKER_IMAGE = 'group-12-auth'
        IMAGE_VERSION = '1.1.0'
        CONTAINER_NAME = 'capstone-auth'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log --oneline -1'
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test -- --runInBand'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Docker Build') {
            when {
                branch 'main'
            }
            steps {
                sh 'docker build -t ${DOCKER_IMAGE}:${BUILD_NUMBER} -t ${DOCKER_IMAGE}:${IMAGE_VERSION} -t ${DOCKER_IMAGE}:latest .'
            }
        }

        stage('Deploy to VM') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([file(credentialsId: 'group-12-auth-env', variable: 'AUTH_ENV_FILE')]) {
                    sh '''
                        docker network inspect capstone-net >/dev/null 2>&1 || docker network create capstone-net
                        docker rm -f group-12-auth ${CONTAINER_NAME} 2>/dev/null || true
                        docker run -d --name ${CONTAINER_NAME} --network capstone-net --env-file "$AUTH_ENV_FILE" --restart unless-stopped -p 3000:3000 ${DOCKER_IMAGE}:${BUILD_NUMBER}
                    '''
                }
            }
        }
    }
}
