plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "kr.gct.passbook"
    compileSdk = 34

    defaultConfig {
        applicationId = "kr.gct.passbook"
        /*
          29(안드로이드 10)로 잡는다. 그 아래에서는 백업 파일을 쓰려면 저장소
          권한을 따로 받아야 하는데, 29부터는 MediaStore로 우리가 만든 파일만
          다루면 권한이 아예 필요 없다. 쓸 폰이 정해져 있으니 낮출 이유가 없다.
        */
        minSdk = 29
        targetSdk = 34
        versionCode = 6
        versionName = "1.5"
    }

    /*
      개인용 앱이라 스토어에 올리지 않는다. 서명 키를 따로 만들어 두는 이유는
      **업데이트를 덮어 설치하기 위해서**다 — 키가 바뀌면 안드로이드가 다른
      앱으로 보고 설치를 거부하고, 지웠다 깔면 그 안의 가계부 데이터가 날아간다.
      키 파일(passbook.jks)을 잃어버리면 그때부터 업데이트가 불가능하다.
    */
    signingConfigs {
        create("selfsigned") {
            storeFile = file("../keys/passbook.jks")
            storePassword = "passbook"
            keyAlias = "passbook"
            keyPassword = "passbook"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false      // 코드 줄이기를 안 한다 — 개인용이라 크기보다 단순함
            signingConfig = signingConfigs.getByName("selfsigned")
        }
        debug {
            signingConfig = signingConfigs.getByName("selfsigned")
        }
    }

    /*
      lint는 끈다. 개인용 앱이라 스토어 심사가 없고, 릴리스 빌드마다 도는
      lintVital이 이 환경에서 경로 오류로 죽는다. 코드 검사는 컴파일러가 한다.
    */
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.activity:activity:1.9.2")
}
