pipeline {
    agent any

    environment {
        DOCKER_IMAGE = 'group-12-auth'
        IMAGE_VERSION = '1.0.0'
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
                sh '''
                    docker network inspect capstone-net >/dev/null 2>&1 || docker network create capstone-net
                    docker stop capstone-auth || true
                    docker rm capstone-auth || true
                    docker run -d --name capstone-auth --network capstone-net --env-file /home/ec2-user/Group-12-Auth/.env -p 3000:3000 ${DOCKER_IMAGE}:${IMAGE_VERSION}
                '''
            }
        }
    }
}
